
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const { initDb, db } = require('./db');
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const expressLayouts = require('express-ejs-layouts');
const ADMIN_PANEL_PASSWORD = 'admin123';
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = 'admin@lotto.com';
const MIN_WITHDRAW = 500;
const MAX_WITHDRAW = 50000;




// view engine
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({ secret: 'change_this_secret', resave: false, saveUninitialized: false }));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Make user and flash messages available in all templates
app.use((req, res, next) => {
res.locals.user = req.user || null;
res.locals.messages = req.flash();
next();
});

// initialize db (creates tables if missing)
initDb();


// passport
passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
if (err) return done(err);
if (!user) return done(null, false, { message: 'Incorrect email.' });
const match = await bcrypt.compare(password, user.password_hash);
if (!match) return done(null, false, { message: 'Incorrect password.' });
return done(null, user);
});
}));
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
db.get('SELECT id, name, email, is_admin, balance FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

//login

app.get('/login', (req, res) => res.render('login', { messages: req.flash() }));
app.post('/login', passport.authenticate('local', { 
  successRedirect: '/dashboard', 
  failureRedirect: '/login', 
  failureFlash: true 
  
}));

// helpers
function ensureAuthenticated(req, res, next) {
if (req.isAuthenticated()) return next();
res.redirect('/login');
}
function ensureAdmin(req, res, next) {
    if (
        req.isAuthenticated() &&
        req.user &&
        req.user.is_admin === 1 &&
        req.user.email === ADMIN_EMAIL
    ) {
        return next();
    }
    res.status(403).send('Forbidden: Admin access only');
}
function ensureAdminPanelAccess(req, res, next) {
    if (!req.session.adminVerified) {
        return res.redirect('/admin-auth');
    }
    next();
}

function manilaNow() {
return moment().tz('Asia/Manila');
}


// JACKPOT API
app.get('/api/jackpot', ensureAuthenticated, (req, res) => {
  const BASE_JACKPOT = 20000;

  // Kuhanin ang total earnings TODAY (Monday–Friday bets)
  db.get(
    `
    SELECT SUM(amount) AS total
    FROM bets
    WHERE DATE(created_at) = DATE('now','localtime')
      AND status IN ('PENDING','placed','lost','won')
    `,
    [],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.json({ jackpot: BASE_JACKPOT });
      }

      const dailyEarnings = row?.total || 0;
      const jackpotIncrease = dailyEarnings * 0.10;
      const jackpot = BASE_JACKPOT + jackpotIncrease;

      res.json({
        base: BASE_JACKPOT,
        dailyEarnings,
        jackpotIncrease,
        jackpot
      });
    }
  );
});



// Admin Authen
app.get('/admin-auth', (req, res) => {
    res.render('admin_auth', { messages: req.flash() });
});

app.post('/admin-auth', ensureAuthenticated, (req, res) => {
    const { admin_password } = req.body;

    if (admin_password !== ADMIN_PANEL_PASSWORD) {
        req.flash('error', 'Incorrect admin password');
        return res.redirect('/admin-auth');
    }

    req.session.adminVerified = true;
    req.flash('success', 'Admin access granted');
    res.redirect('/admin');
});



// AUTO-CREATE ADMIN ACCOUNT
db.get(
  'SELECT id FROM users WHERE email = ?',
  [ADMIN_EMAIL],
  async (err, row) => {
    if (!row) {
      const hash = await bcrypt.hash('admin123', 10);
      db.run(
        'INSERT INTO users (name,email,password_hash,balance,is_admin) VALUES (?,?,?,?,1)',
        ['Super Admin', ADMIN_EMAIL, hash, 0]
      );
      console.log('✅ Admin account created');
    }
  }
);

// Routes
app.get('/', (req, res) => {
res.render('index', { user: req.user, messages: req.flash() });
});


app.get('/register', (req, res) => res.render('register', { messages: req.flash() }));
app.post('/register', async (req, res) => {
const { name, email, password } = req.body;
if (!name || !email || !password) {
req.flash('error', 'All fields required');
return res.redirect('/register');
}
const hash = await bcrypt.hash(password, 10);
db.run('INSERT INTO users (name,email,password_hash,balance,is_admin) VALUES (?,?,?,?,0)', [name, email, hash, 0], function(err) {
if (err) {
req.flash('error', 'Email may already be registered');
return res.redirect('/register');
}
req.flash('success', 'Account created. Please log in.');
res.redirect('/login');
});
});

app.get('/login', (req, res) => res.render('login', { messages: req.flash() }));
app.post('/login', passport.authenticate('local', { successRedirect: '/dashboard', failureRedirect: '/login', failureFlash: true }));
app.get('/logout', (req, res) => {
    req.session.adminVerified = false;
    req.logout(() => {});
    res.redirect('/');
});

// dashboard
app.get('/dashboard', ensureAuthenticated, (req, res) => {
    db.all('SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, bets) => {
    db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err2, txs) => {
        res.render('dashboard', { user: req.user, bets, txs, messages: req.flash() });
    });
});


// fetch user bets and transactions
db.all('SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, bets) => {
db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err2, txs) => {
res.render('dashboard', { user: req.user, bets, txs, messages: req.flash() });
});
});
});

// Top-up (simulate GCash): user submits a topup request with reference; admin will confirm
app.get('/topup', ensureAuthenticated, (req, res) => res.render('topup', { user: req.user, messages: req.flash() }));
app.post('/topup', ensureAuthenticated, (req, res) => {
const { amount, reference } = req.body;
if (!amount || amount <= 0) { req.flash('error','Invalid amount'); return res.redirect('/topup'); }
const id = uuidv4();
db.run('INSERT INTO transactions (id,user_id,type,amount,status,reference,created_at) VALUES (?,?,?,?,?,?,?)', [id, req.user.id, 'topup', amount, 'pending', reference || '', new Date().toISOString()], function(err){
req.flash('success','Top-up request created. It will be credited once admin verifies your payment.');
res.redirect('/dashboard');
});
});




//GET BET PAGE
app.get('/bet', ensureAuthenticated, (req, res) => {
    res.render('bet', { user: req.user, messages: req.flash() });


});





//POST PLACE BET
app.post('/bet', ensureAuthenticated, (req, res) => {
  const dow = manilaNow().day(); // 0 Sun .. 6 Sat
  if (dow === 0 || dow === 6) {
    req.flash('error','Bets allowed Monday to Friday only');
    return res.redirect('/bet'); 
  }

  const numsRaw = (req.body.numbers || '').split(',');
  const nums = numsRaw.map(n => parseInt(n)).filter(n => !isNaN(n));

  if (nums.length !== 6) {
    req.flash('error','Choose exactly 6 numbers'); 
    return res.redirect('/bet'); 
  }

  const valid = nums.every(n => n >= 1 && n <= 50) && (new Set(nums)).size === 6;
  if (!valid) {
    req.flash('error','Numbers must be 6 unique values between 1 and 50'); 
    return res.redirect('/bet'); 
  }

  const price = 20;

  db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) { console.error(err); req.flash('error','DB error'); return res.redirect('/bet'); }

    const balance = row.balance || 0;
    if (balance < price) { 
      req.flash('error','Insufficient balance. Please top-up'); 
      return res.redirect('/topup'); 
    }

    const now = new Date().toISOString();

    // Deduct balance
    db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [price, req.user.id], function(err2){
      if (err2) { console.error(err2); req.flash('error','Failed to deduct balance'); return res.redirect('/bet'); }

      // Insert bet
      db.run(
        'INSERT INTO bets (user_id, numbers, amount, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, nums.join(','), price, 'PENDING', now],
        function(err3) {
          if (err3) {
            console.error('Bet insert error:', err3);
            req.flash('error','Failed to place bet'); 
            return res.redirect('/bet');
          }
          console.log('Bet placed:', nums.join(','));
          req.flash('success','Bet placed successfully!');
          res.redirect('/dashboard');
        }
      );
    });
  });
});




// Withdraw request
app.get('/withdraw', ensureAuthenticated, (req, res) =>
  res.render('withdraw', { user: req.user, messages: req.flash() })
);

app.post('/withdraw', ensureAuthenticated, (req, res) => {
  const { amount, gcash_number } = req.body;
  const a = parseFloat(amount);

  // BASIC VALIDATION
  if (!a || isNaN(a)) {
    req.flash('error', 'Invalid withdrawal amount');
    return res.redirect('/withdraw');
  }

  // MINIMUM LIMIT
  if (a < MIN_WITHDRAW) {
    req.flash(
      'error',
      `Minimum withdrawal amount is ₱${MIN_WITHDRAW.toLocaleString()}`
    );
    return res.redirect('/withdraw');
  }

  // MAXIMUM LIMIT
  if (a > MAX_WITHDRAW) {
    req.flash(
      'error',
      `Maximum withdrawal per transaction is ₱${MAX_WITHDRAW.toLocaleString()}`
    );
    return res.redirect('/withdraw');
  }

  db.get(
    'SELECT balance FROM users WHERE id = ?',
    [req.user.id],
    (err, row) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Database error');
        return res.redirect('/withdraw');
      }

      const balance = row.balance || 0;

      // CHECK BALANCE
      if (balance < a) {
        req.flash('error', 'Insufficient balance');
        return res.redirect('/withdraw');
      }

      const id = uuidv4();

      // CREATE WITHDRAW TRANSACTION
      db.run(
        `INSERT INTO transactions
         (id, user_id, type, amount, status, reference, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          req.user.id,
          'withdraw',
          a,
          'pending',
          gcash_number || '',
          new Date().toISOString(),
        ],
        function (err2) {
          if (err2) {
            console.error(err2);
            req.flash('error', 'Failed to create withdrawal request');
            return res.redirect('/withdraw');
          }

          // RESERVE FUNDS (DEDUCT BALANCE)
          db.run(
            'UPDATE users SET balance = balance - ? WHERE id = ?',
            [a, req.user.id],
            function (err3) {
              if (err3) {
                console.error(err3);
                req.flash('error', 'Failed to reserve balance');
                return res.redirect('/withdraw');
              }

              req.flash(
                'success',
                'Withdrawal request submitted. Admin will process it.'
              );
              res.redirect('/dashboard');
            }
          );
        }
      );
    }
  );
});

// Admin panel
app.get('/admin', ensureAdmin, ensureAdminPanelAccess, (req, res) => {
db.all('SELECT * FROM bets ORDER BY created_at DESC', [], (err, bets) => {
db.all('SELECT * FROM transactions ORDER BY created_at DESC', [], (err2, txs) => {
db.all('SELECT id,name,email,balance,is_admin FROM users', [], (err3, users)=>{
res.render('admin', { user: req.user, bets, txs, users, messages: req.flash() });
});
});
});
});



// Admin: confirm topup
app.post('/admin/tx/confirm', ensureAdmin, (req,res)=>{
const { id } = req.body;
db.get('SELECT * FROM transactions WHERE id = ?', [id], (err, tx)=>{
if (!tx) { req.flash('error','Tx not found'); return res.redirect('/admin'); }
if (tx.type !== 'topup') { req.flash('error','Not a topup'); return res.redirect('/admin'); }
if (tx.status !== 'pending') { req.flash('error','Already processed'); return res.redirect('/admin'); }
db.run('UPDATE transactions SET status = ? WHERE id = ?', ['confirmed', id], function(){
// credit user's balance
db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [tx.amount, tx.user_id], function(){
req.flash('success','Topup confirmed and user credited');
res.redirect('/admin');
});
});
});
});


// Admin: approve withdraw (mark as paid)
app.post('/admin/tx/complete', ensureAdmin, (req,res)=>{
const { id } = req.body;
db.get('SELECT * FROM transactions WHERE id = ?', [id], (err, tx)=>{
if (!tx) { req.flash('error','Tx not found'); return res.redirect('/admin'); }
if (tx.type !== 'withdraw') { req.flash('error','Not a withdraw'); return res.redirect('/admin'); }
if (tx.status !== 'pending') { req.flash('error','Already processed'); return res.redirect('/admin'); }
db.run('UPDATE transactions SET status = ? WHERE id = ?', ['paid', id], function(){
req.flash('success','Withdraw marked as paid');
res.redirect('/admin');
});
});
});

// Admin: enter Saturday result and process winners
app.get('/admin/result', ensureAdmin, (req,res)=>{
res.render('enter_result', { user: req.user, messages: req.flash() });
});
app.post('/admin/result', ensureAdmin, (req,res)=>{
const { numbers } = req.body; // expect comma separated 6 numbers
const nums = (numbers||'').split(',').map(n=>parseInt(n)).filter(n=>!isNaN(n));
if (nums.length !== 6) { req.flash('error','Provide 6 numbers'); return res.redirect('/admin/result'); }
// store result
const now = new Date().toISOString();
const resultId = uuidv4();
db.run('INSERT INTO results (id,numbers,created_at) VALUES (?,?,?)', [resultId, nums.join(','), now], function(err){
// find winning bets: exact match of numbers ignoring order
db.all('SELECT * FROM bets WHERE status IN ("pending","placed")', [], (err2, bets)=>{
const winners = [];
bets.forEach(b => {
const bnums = b.numbers.split(',').map(x=>parseInt(x)).sort((a,b)=>a-b);
const rnums = nums.slice().sort((a,b)=>a-b);
// exact match
if (JSON.stringify(bnums) === JSON.stringify(rnums)) winners.push(b);
});
// payout each winner: define prize (for demo, jackpot = 1000 * amount?) Adjust as needed
const prizeMultiplier = 100; // demo multiplier
winners.forEach(w => {
const prize = w.amount * prizeMultiplier;
const txId = uuidv4();
db.run('INSERT INTO transactions (id,user_id,type,amount,status,reference,created_at) VALUES (?,?,?,?,?,?,?)', [txId, w.user_id, 'payout', prize, 'confirmed', 'win:'+resultId, new Date().toISOString()], ()=>{
db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [prize, w.user_id]);
db.run('UPDATE bets SET status = ? WHERE id = ?', ['won', w.id]);
});
});
// mark other processed bets as lost
const winnerIds = winners.map(w=>w.id);
db.all('SELECT id FROM bets WHERE status IN ("pending","placed")', [], (err3, allB)=>{
allB.forEach(bb => {
if (!winnerIds.includes(bb.id)) db.run('UPDATE bets SET status = ? WHERE id = ?', ['lost', bb.id]);
});
});


req.flash('success', `Result entered. Winners processed: ${winners.length}`);
res.redirect('/admin');
});
});
});
  



//Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});