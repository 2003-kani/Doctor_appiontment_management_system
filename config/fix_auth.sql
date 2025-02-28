-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS project;

-- Update root user authentication
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';
FLUSH PRIVILEGES;

-- Use the project database
USE project;
