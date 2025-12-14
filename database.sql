-- Users Table
CREATE TABLE users (
id INT IDENTITY(1,1) PRIMARY KEY,
username VARCHAR(50) NOT NULL UNIQUE,
password VARCHAR(255) NOT NULL,
email VARCHAR(100) NOT NULL UNIQUE,
date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Transactions Table
CREATE TABLE transactions (
id INT IDENTITY(1,1) PRIMARY KEY,
user_id INT NOT NULL,
gcash_number DECIMAL(10,2) NOT NULL,
amount DECIMAL(10,2) NOT NULL,
transaction_type VARCHAR(20) NOT NULL,
status VARCHAR(20) DEFAULT 'pending',
date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (user_id) REFERENCES users(id)
);


-- Bets Table
CREATE TABLE bets (
    bet_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    bet_numbers VARCHAR(50) NOT NULL,
    draw_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    result VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);


-- Draw Results Table
CREATE TABLE draw_results (
id INT IDENTITY(1,1) PRIMARY KEY,
draw_date DATE NOT NULL,
winning_numbers VARCHAR(50) NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

