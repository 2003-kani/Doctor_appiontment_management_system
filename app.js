const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const twilio = require('twilio');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    debug: true // Enable debug logging
});

// Test email connection immediately
transporter.verify(function(error, success) {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server is ready');
    }
});

// Email notification functions
const sendAppointmentNotification = async (appointment, doctorEmail, patientEmail) => {
    try {
        console.log('Email would be sent with:', {
            appointment,
            doctorEmail,
            patientEmail
        });
        return true;
    } catch (error) {
        console.error('Error sending appointment notification emails:', error);
        return false;
    }
};

const sendAppointmentStatusUpdate = async (appointment, patientEmail, status, reason = '') => {
    try {
        // Get doctor and patient details
        const [[doctor]] = await pool.query(
            `SELECT CONCAT(d.first_name, ' ', d.last_name) as name, d.specialization 
             FROM doctors d 
             WHERE d.id = ?`,
            [appointment.doctor_id]
        );

        const [[patient]] = await pool.query(
            `SELECT CONCAT(p.first_name, ' ', p.last_name) as name 
             FROM patients p 
             WHERE p.id = ?`,
            [appointment.patient_id]
        );

        if (!doctor || !patient) {
            throw new Error('Could not find doctor or patient details');
        }

        const emailContent = emailTemplates.appointmentStatusUpdate({
            date: appointment.appointment_date,
            time: appointment.appointment_time,
            doctorName: doctor.name,
            patientName: patient.name,
            status: status,
            reason: reason
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: patientEmail,
            subject: `Appointment Status Update - ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            html: emailContent
        });

        console.log(`Status update email sent to ${patientEmail}`);
        return true;
    } catch (error) {
        console.error('Error sending status update email:', error);
        throw error;
    }
};

// Email Templates
const emailTemplates = {
    newAppointment({ date, time, doctorName, patientName, symptoms }) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50;">New Appointment Confirmation</h2>
                <p>Dear ${patientName},</p>
                <p>Your appointment has been successfully scheduled with ${doctorName}.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                    <p><strong>Appointment Details:</strong></p>
                    <p>Date: ${new Date(date).toLocaleDateString()}</p>
                    <p>Time: ${time}</p>
                    <p>Doctor: ${doctorName}</p>
                    <p>Symptoms: ${symptoms}</p>
                </div>
                <p>Please arrive 10 minutes before your scheduled time.</p>
                <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
                <p>Best regards,<br>DoctorHealthcare Team</p>
            </div>
        `;
    },

    appointmentReminder({ date, time, doctorName, patientName, specialization }) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50;">Appointment Reminder</h2>
                <p>Dear ${patientName},</p>
                <p>This is a friendly reminder about your upcoming appointment.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                    <p><strong>Appointment Details:</strong></p>
                    <p>Date: ${new Date(date).toLocaleDateString()}</p>
                    <p>Time: ${time}</p>
                    <p>Doctor: ${doctorName}</p>
                    <p>Specialization: ${specialization}</p>
                </div>
                <p>Please arrive 10 minutes before your scheduled time.</p>
                <p>Location: DoctorHealthcare Center</p>
                <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
                <p>Best regards,<br>DoctorHealthcare Team</p>
            </div>
        `;
    },

    appointmentStatusUpdate({ date, time, doctorName, patientName, status, reason }) {
        const statusMessages = {
            confirmed: 'Your appointment has been confirmed by the doctor.',
            cancelled: 'Your appointment has been cancelled.',
            completed: 'Your appointment has been marked as completed.',
            rescheduled: 'Your appointment has been rescheduled.'
        };

        const statusColors = {
            confirmed: '#28a745',
            cancelled: '#dc3545',
            completed: '#17a2b8',
            rescheduled: '#ffc107'
        };

        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: ${statusColors[status] || '#2c3e50'};">Appointment Status Update</h2>
                <p>Dear ${patientName},</p>
                <p>${statusMessages[status] || 'Your appointment status has been updated.'}</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                    <p><strong>Appointment Details:</strong></p>
                    <p>Date: ${new Date(date).toLocaleDateString()}</p>
                    <p>Time: ${time}</p>
                    <p>Doctor: ${doctorName}</p>
                    <p>Status: <span style="color: ${statusColors[status] || '#2c3e50'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></p>
                    ${reason ? `<p>Reason: ${reason}</p>` : ''}
                </div>
                ${status === 'cancelled' ? '<p>Please visit our website to schedule a new appointment.</p>' : ''}
                <p>If you have any questions, please don't hesitate to contact us.</p>
                <p>Best regards,<br>DoctorHealthcare Team</p>
            </div>
        `;
    }
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-custom-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// Serve static files
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// Update the authentication middleware
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        // Allow any authenticated user
        return next();
    }
    console.log('Authentication failed:', {
        session: req.session,
        userId: req.session?.userId,
        role: req.session?.role
    });
        res.redirect('/login');
    }
/*
// Add role-specific middleware
function isAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.role === 'admin') {
        return next();
    }
    res.redirect('/admin');
}
*/
function isAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Not authorized. Admin access required.' });
    }
}
function isDoctor(req, res, next) {
    if (req.session && req.session.userId && req.session.role === 'doctor') {
        return next();
    }
    res.redirect('/login');
}

function isPatient(req, res, next) {
    if (req.session && req.session.userId && req.session.role === 'patient') {
        return next();
    }
    res.redirect('/login');
}

// Update the routes to use appropriate middleware
app.get('/admin/dashboard', isAdmin, (req, res) => {
    res.render('admin-dashboard', {
        user: {
            name: 'Admin',
            role: 'admin'
        }
    });
});

app.get('/doctor-dashboard', isDoctor, async (req, res) => {
    try {
        // Get doctor details with more information
        const [doctors] = await pool.query(`
            SELECT 
                d.*,
                u.first_name,
                u.last_name,
                u.email,
                u.phone,
                u.gender,
                COUNT(DISTINCT a.patient_id) as total_patients,
                COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END) as completed_appointments,
                COUNT(DISTINCT CASE WHEN a.status = 'pending' THEN a.id END) as pending_appointments,
                COUNT(DISTINCT CASE 
                    WHEN a.status = 'confirmed' 
                    AND a.appointment_date = CURDATE() 
                    THEN a.id 
                END) as today_appointments
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN appointments a ON d.id = a.doctor_id
            WHERE u.id = ?
            GROUP BY d.id
        `, [req.session.userId]);

        if (doctors.length === 0) {
            throw new Error('Doctor not found');
        }

        const doctor = doctors[0];

        // Get all appointments for this doctor
        const [allAppointments] = await pool.query(`
            SELECT 
                a.*,
                CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
                pu.phone as patient_phone,
                pu.email as patient_email,
                p.blood_group,
                p.address
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN users pu ON p.user_id = pu.id
            WHERE a.doctor_id = ?
            ORDER BY a.appointment_date DESC, a.appointment_time ASC
        `, [doctor.id]);

        // Get all patients for this doctor
        const [allPatients] = await pool.query(`
            SELECT DISTINCT
                p.id,
                CONCAT(u.first_name, ' ', u.last_name) as patient_name,
                u.email,
                u.phone,
                p.blood_group,
                p.address,
                COUNT(a.id) as visit_count,
                MAX(a.appointment_date) as last_visit
            FROM patients p
            JOIN users u ON p.user_id = u.id
            JOIN appointments a ON p.id = a.patient_id
            WHERE a.doctor_id = ?
            GROUP BY p.id
            ORDER BY last_visit DESC
        `, [doctor.id]);

        // Get doctor's schedule
        const [schedule] = await pool.query(`
            SELECT 
                DAYNAME(appointment_date) as day,
                COUNT(*) as appointment_count,
                GROUP_CONCAT(appointment_time) as appointment_times
            FROM appointments
            WHERE doctor_id = ?
            AND appointment_date >= CURDATE()
            GROUP BY day
            ORDER BY FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
        `, [doctor.id]);

        // Format appointments for different views
        const formattedAppointments = allAppointments.map(apt => ({
            ...apt,
            formatted_date: new Date(apt.appointment_date).toLocaleDateString(),
            status_class: apt.status.toLowerCase(),
            is_upcoming: new Date(apt.appointment_date) >= new Date(),
            is_past: new Date(apt.appointment_date) < new Date(),
            can_modify: ['pending', 'confirmed'].includes(apt.status)
        }));

        // Calculate enhanced stats
        const stats = {
            totalPatients: doctor.total_patients || 0,
            totalAppointments: doctor.completed_appointments + doctor.pending_appointments || 0,
            pendingAppointments: doctor.pending_appointments || 0,
            completedAppointments: doctor.completed_appointments || 0,
            todayAppointments: doctor.today_appointments || 0,
            appointmentStats: {
                completed: doctor.completed_appointments || 0,
                pending: doctor.pending_appointments || 0,
                cancelled: allAppointments.filter(a => a.status === 'cancelled').length || 0
            }
        };

        res.render('doctor-dashboard', {
            name: `Dr. ${doctor.first_name} ${doctor.last_name}`,
            email: doctor.email,
            phone: doctor.phone,
            doctor: doctor,
            todayAppointments: allAppointments.filter(a => new Date(a.appointment_date) === new Date()),
            upcomingAppointments: allAppointments.filter(a => new Date(a.appointment_date) > new Date()),
            recentPatients: allPatients,
            allAppointments: formattedAppointments,
            allPatients,
            schedule,
            stats: stats,
            appointmentsByStatus: {
                pending: allAppointments.filter(a => a.status === 'pending'),
                confirmed: allAppointments.filter(a => a.status === 'confirmed'),
                completed: allAppointments.filter(a => a.status === 'completed')
            }
        });

    } catch (error) {
        console.error('Error loading doctor dashboard:', error);
        res.status(500).render('error', { message: 'Error loading dashboard' });
    }
});

app.get('/patient-dashboard', isAuthenticated, async (req, res) => {
    try {
        // Get user and patient details with patient ID
        const [users] = await pool.query(`
            SELECT 
                u.first_name,
                u.last_name,
                u.email,
                u.phone,
                u.gender,
                p.id as patient_id,
                p.address,
                p.blood_group
            FROM users u
            LEFT JOIN patients p ON p.user_id = u.id
            WHERE u.id = ?
        `, [req.session.userId]);

        if (users.length === 0) {
            throw new Error('User not found');
        }

        const user = users[0];

        // Get appointments using patient_id
        const [appointments] = await pool.query(`
            SELECT 
                a.*,
                CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
                d.specialization,
                d.consultation_fee,
                d.id as doctor_id
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users du ON d.user_id = du.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC
        `, [user.patient_id]);

        // Get all doctors for directory
        const [doctors] = await pool.query(`
            SELECT 
                d.id,
                d.specialization,
                d.qualification,
                d.experience_years,
                d.consultation_fee,
                u.first_name,
                u.last_name,
                u.gender
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            ORDER BY d.experience_years DESC
        `);

        // Format appointments for display
        const formattedAppointments = appointments.map(apt => ({
            ...apt,
            appointment_date: new Date(apt.appointment_date).toLocaleDateString(),
            status_class: apt.status.toLowerCase(),
            can_cancel: ['pending', 'confirmed'].includes(apt.status)
        }));

        // Get recent appointments (last 5)
        const recentAppointments = formattedAppointments.slice(0, 5);

        // Calculate stats
        const stats = {
            totalAppointments: appointments.length,
            upcomingAppointments: appointments.filter(a => new Date(a.appointment_date) >= new Date()).length,
            pastAppointments: appointments.filter(a => new Date(a.appointment_date) < new Date()).length
        };

        res.render('patient-dashboard', {
            name: `${user.first_name} ${user.last_name}`,
            email: user.email,
            phone: user.phone,
            patient: user,
            user: {
                name: `${user.first_name} ${user.last_name}`,
                email: user.email
            },
            appointmentsData: JSON.stringify(formattedAppointments),
            appointments: formattedAppointments,
            recentAppointments: recentAppointments,
            doctors: doctors,
            stats: stats
        });

    } catch (error) {
        console.error('Error loading patient dashboard:', error);
        res.status(500).render('error', { message: 'Error loading dashboard' });
    }
});

// Update the login route
app.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        console.log('\n=== Login Attempt ===');
        console.log('Login details:', { email, role });

        // Get user with role
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND role = ?',
            [email, role]
        );

        if (users.length === 0) {
            console.log('❌ User not found');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        console.log('✓ User found:', { id: user.id, role: user.role });

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log('Password check:', { 
            provided: password,
            stored: user.password.substring(0, 10) + '...',
            matches: passwordMatch 
        });

        if (!passwordMatch) {
            console.log('❌ Password verification failed');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
                req.session.userId = user.id;
        req.session.role = user.role;
        console.log('✓ Session created:', req.session);

        res.json({
            success: true,
            redirect: `/${role}-dashboard`
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error during login' });
    }
});

// Update database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "doctor_appointment",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

// Add this to test the connection
pool.getConnection()
    .then(connection => {
        console.log('Database connected successfully');
    connection.release();
    })
    .catch(err => {
        console.error('Error connecting to the database:', err);
    });

// Remove the old test connection code and replace with this
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('Connected to database successfully!');
        connection.release();
    } catch (err) {
        console.error('Error connecting to database:', err);
    }
};

// Call testConnection
testConnection();

// Initialize database tables
const initDatabase = async () => {
    try {
        // Create database if not exists
        await pool.query('CREATE DATABASE IF NOT EXISTS doctor_appointment');
        
        // Use the database
        await pool.query('USE doctor_appointment');

    const tables = [
            // Users table (common fields for all users)
            `CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
                first_name VARCHAR(50) NOT NULL,
                last_name VARCHAR(50) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
                phone VARCHAR(20) NOT NULL,
            password VARCHAR(255) NOT NULL,
                role ENUM('patient', 'doctor', 'admin') NOT NULL,
                gender ENUM('male', 'female', 'other') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

            // Patients table
        `CREATE TABLE IF NOT EXISTS patients (
            id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                dob DATE NOT NULL,
            blood_group VARCHAR(5),
                address TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,

            // Doctors table
            `CREATE TABLE IF NOT EXISTS doctors (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                specialization VARCHAR(100) NOT NULL,
                qualification VARCHAR(200) NOT NULL,
                experience_years INT NOT NULL,
                consultation_fee DECIMAL(10,2) DEFAULT 500.00,
                license_number VARCHAR(50),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,

            // Appointments table
        `CREATE TABLE IF NOT EXISTS appointments (
            id INT PRIMARY KEY AUTO_INCREMENT,
                patient_id INT NOT NULL,
                doctor_id INT NOT NULL,
            appointment_date DATE NOT NULL,
            appointment_time TIME NOT NULL,
            status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
                symptoms TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
            )`,

            // Admin table
            `CREATE TABLE IF NOT EXISTS admins (
            id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                access_level ENUM('full', 'limited') DEFAULT 'full',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`
        ];

        // Create tables if they don't exist
        for (const query of tables) {
            await pool.query(query);
            console.log('Table verified/created successfully');
        }

        // Check if admin exists, create only if not exists
        const [existingAdmin] = await pool.query(
            'SELECT id FROM users WHERE email = ? AND role = ?',
            ['admin@hospital.com', 'admin']
        );

        if (existingAdmin.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            
            // Insert admin user
            const [adminUser] = await pool.query(
                `INSERT INTO users (first_name, last_name, email, phone, password, role, gender) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['Admin', 'User', 'admin@hospital.com', '1234567890', hashedPassword, 'admin', 'other']
            );

            // Create admin record
            await pool.query(
                `INSERT INTO admins (user_id, access_level) VALUES (?, ?)`,
                [adminUser.insertId, 'full']
            );
            console.log('Default admin user created');
        }

        // Update the doctors table creation in initDatabase function
        const createDoctorsTable = `
            CREATE TABLE IF NOT EXISTS doctors (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT UNIQUE,
                specialization VARCHAR(100) NOT NULL,
                qualification VARCHAR(200) NOT NULL,
                license_number VARCHAR(50) NOT NULL,
                experience_years INT NOT NULL,
                consultation_fee DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`;

        // Add this after your existing tables are created
        await pool.query(createDoctorsTable);

        console.log('Database initialization completed');
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    }
};

// Initialize database on startup
initDatabase().catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
});

// Schedule reminder check every hour
cron.schedule('0 * * * *', async () => {
    try {
        const [appointments] = await pool.query(`
            SELECT a.*,
                   CONCAT(doc_u.first_name, ' ', doc_u.last_name) as doctor_name,
                   CONCAT(pat_u.first_name, ' ', pat_u.last_name) as patient_name,
                   pat_u.email as patient_email,
                   d.specialization
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users doc_u ON d.user_id = doc_u.id
            JOIN patients p ON a.patient_id = p.id
            JOIN users pat_u ON p.user_id = pat_u.id
            WHERE a.appointment_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND a.status = 'pending'
        `);

        for (const appointment of appointments) {
            const reminderTemplate = emailTemplates.appointmentReminder(
                appointment,
                appointment.doctor_name,
                appointment.patient_name
            );

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: appointment.patient_email,
                ...reminderTemplate
            });
        }
    } catch (error) {
        console.error('Error sending reminder emails:', error);
    }
});

// Public routes
app.get('/', async (req, res) => {
    try {
        const [doctors] = await pool.query(`
            SELECT 
                d.id,
                d.specialization,
                d.qualification,
                d.experience_years,
                u.first_name,
                u.last_name,
                u.gender
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE u.role = 'doctor'
            LIMIT 6
        `);

        const contactInfo = {
            phone: '8977218926',
            email: 'damsysmjp@gmail.com',
            address: 'Your Hospital Address'
        };
        
        res.render('index', { 
            contactInfo,
            doctors
        });
    } catch (error) {
        console.error('Error fetching doctors:', error);
        res.render('index', { 
            contactInfo: {
                phone: '8977218926',
                email: 'damsysmjp@gmail.com',
                address: 'Your Hospital Address'
            },
            doctors: []
        });
    }
});

app.get('/services', (req, res) => {
    res.render('services');
});

app.get('/doctors', async (req, res) => {
    try {
        const [doctors] = await pool.query(`
            SELECT d.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as name,
                   u.email,
                   u.phone
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE u.role = 'doctor'
        `);
        
        res.render('doctors', { doctors });
    } catch (error) {
        console.error('Error in doctors route:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get('/contact', (req, res) => {
    res.render('contact');
});

app.post('/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        
        // Send email notification
        await transporter.sendMail({
            from: 'damsysmjp@gmail.com',
            to: 'damsysmjp@gmail.com', // Admin email
            subject: 'New Contact Form Submission',
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong> ${message}</p>
            `
        });

        // Send confirmation email to user
        await transporter.sendMail({
            from: 'damsysmjp@gmail.com',
            to: email,
            subject: 'Thank you for contacting us',
            html: `
                <h2>Thank you for contacting us!</h2>
                <p>Dear ${name},</p>
                <p>We have received your message and will get back to you shortly.</p>
                <p>Best regards,<br>DoctorHealthcare Team</p>
            `
        });

        res.status(200).json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending contact form:', error);
        res.status(500).json({ success: false, message: 'Error sending message' });
    }
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.get('/register-patient', (req, res) => {
    res.render('register-patient', { error: null });
});

app.get('/register-doctor', (req, res) => {
    res.render('register-doctor', { error: null });
});

app.get('/admin/create-doctor', isAuthenticated, (req, res) => {
    console.log('Session:', req.session); // Add this for debugging
    res.render('create-doctor', {
        error: null,
        user: {
            role: 'admin'
        }
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/');
    });
});

// Login API
app.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        console.log('\n=== Login Attempt ===');
        console.log('Login details:', { email, role });

        // Get user with role
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND role = ?',
            [email, role]
        );

        if (users.length === 0) {
            console.log('❌ User not found');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        console.log('✓ User found:', { id: user.id, role: user.role });

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log('Password check:', { 
            provided: password,
            stored: user.password.substring(0, 10) + '...',
            matches: passwordMatch 
        });

        if (!passwordMatch) {
            console.log('❌ Password verification failed');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
                req.session.userId = user.id;
        req.session.role = user.role;
        console.log('✓ Session created:', req.session);

        res.json({
            success: true,
            redirect: `/${role}-dashboard`
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error during login' });
    }
});

// Protected routes - Apply isAuthenticated middleware
app.get('/doctor-dashboard', isAuthenticated, async (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.redirect('/login');
    }

    try {
        const doctorQuery = `
            SELECT d.*, 
                (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id = d.id) as total_patients,
                (SELECT COUNT(*) FROM appointments WHERE doctor_id = d.id AND DATE(appointment_date) = CURDATE()) as today_appointments,
                (SELECT COUNT(*) FROM appointments WHERE doctor_id = d.id AND status = 'pending') as pending_appointments,
                (SELECT COUNT(*) FROM appointments WHERE doctor_id = d.id AND status = 'completed') as completed_appointments
            FROM doctors d 
            WHERE d.id = ?
        `;

        const appointmentsQuery = `
            SELECT a.*, p.name as patient_name, p.email as patient_email, p.phone as patient_phone
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            WHERE a.doctor_id = ? AND DATE(a.appointment_date) = CURDATE()
            ORDER BY a.appointment_time
        `;

        const patientsQuery = `
            SELECT DISTINCT p.*, 
                (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND doctor_id = ?) as total_visits,
                (SELECT MAX(appointment_date) FROM appointments WHERE patient_id = p.id AND doctor_id = ?) as last_visit
            FROM patients p
            JOIN appointments a ON p.id = a.patient_id
            WHERE a.doctor_id = ?
        `;

        pool.query(
            doctorQuery + ';' + appointmentsQuery + ';' + patientsQuery,
            [req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId],
            (err, results) => {
                if (err) {
                    console.error('Error fetching doctor dashboard data:', err);
                    return res.status(500).send('Error loading dashboard');
                }

                const [doctorResults, appointmentsResults, patientsResults] = results;
                
                res.render('doctor_dashboard', {
                    doctor: doctorResults[0],
                    stats: {
                        total_patients: doctorResults[0].total_patients || 0,
                        today_appointments: doctorResults[0].today_appointments || 0,
                        pending_appointments: doctorResults[0].pending_appointments || 0,
                        completed_appointments: doctorResults[0].completed_appointments || 0
                    },
                    todayAppointments: appointmentsResults || [],
                    patients: patientsResults || []
                });

            }
        );
    } catch (error) {
        console.error('Error in doctor dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
});

app.get('/doctor-appointment-form', isAuthenticated, async (req, res) => {
    if (req.session.role !== 'patient') {
        return res.redirect('/login');
    }

    try {
        // Get patient details
        const patientQuery = 'SELECT * FROM patients WHERE id = ?';
        // Get available doctors
        const doctorsQuery = `
            SELECT d.*, 
                (SELECT AVG(rating) FROM reviews WHERE doctor_id = d.id) as rating,
                (SELECT COUNT(*) FROM reviews WHERE doctor_id = d.id) as reviews
            FROM doctors d 
            WHERE d.active = 1
            ORDER BY d.name
        `;

        pool.query(patientQuery + ';' + doctorsQuery, [req.session.userId], (err, results) => {
            if (err) {
                console.error('Error fetching appointment form data:', err);
                return res.status(500).send('Error loading appointment form');
            }

            const [patientResults, doctorsResults] = results;

            if (!patientResults || patientResults.length === 0) {
                return res.redirect('/login');
            }

            res.render('doctor_appointment_form', {
                patient: patientResults[0],
                doctors: doctorsResults || []
            });
        });
    } catch (error) {
        console.error('Error in appointment form:', error);
        res.status(500).send('Error loading appointment form');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/login');
    });
});

// Initialize Twilio client if credentials are available
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && 
    process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_PHONE_NUMBER) {
    twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
}

// Function to send SMS notifications
async function sendSMSNotification(to, message) {
    if (!twilioClient) {
        console.log('SMS notification skipped - Twilio not configured');
        return false;
    }

    try {
        const result = await twilioClient.messages.create({
            body: message,
            to: to,
            from: process.env.TWILIO_PHONE_NUMBER
        });
        console.log('SMS sent successfully:', result.sid);
        return true;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return false;
    }
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(to, message) {
    if (!twilioClient) {
        console.log('WhatsApp notification skipped - Twilio not configured');
        return false;
    }

    try {
        // Format the phone number for WhatsApp
        const whatsappNumber = `whatsapp:${to}`;
        const result = await twilioClient.messages.create({
            body: message,
            from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
            to: whatsappNumber
        });
        console.log('WhatsApp message sent successfully:', result.sid);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return false;
    }
}

// Function to format phone number to international format
function formatPhoneNumber(phone) {
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if not present (assuming Indian numbers)
    if (!cleaned.startsWith('91')) {
        return `+91${cleaned}`;
    }
    return `+${cleaned}`;
}

// Function to send appointment emails
async function sendAppointmentEmails(patientEmail, doctorEmail, appointmentDetails) {
    try {
        console.log('Sending appointment emails to:', { patientEmail, doctorEmail });

        // Send email to patient
        const patientEmailContent = emailTemplates.newAppointment({
            date: appointmentDetails.appointment_date,
            time: appointmentDetails.appointment_time,
            doctorName: appointmentDetails.doctor_name,
            patientName: appointmentDetails.patient_name,
            symptoms: appointmentDetails.symptoms
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: patientEmail,
            subject: 'Appointment Confirmation',
            html: patientEmailContent
        });

        console.log('Patient email sent successfully');

        // Send email to doctor
        const doctorEmailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50;">New Appointment Scheduled</h2>
                <p>Dear Dr. ${appointmentDetails.doctor_name},</p>
                <p>A new appointment has been scheduled with you.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                    <p><strong>Appointment Details:</strong></p>
                    <p>Date: ${new Date(appointmentDetails.appointment_date).toLocaleDateString()}</p>
                    <p>Time: ${appointmentDetails.appointment_time}</p>
                    <p>Patient: ${appointmentDetails.patient_name}</p>
                    <p>Symptoms: ${appointmentDetails.symptoms}</p>
                </div>
                <p>Please review and confirm the appointment.</p>
                <p>Best regards,<br>DoctorHealthcare Team</p>
            </div>
        `;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: doctorEmail,
            subject: 'New Appointment Scheduled',
            html: doctorEmailContent
        });

        console.log('Doctor email sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending appointment emails:', error);
        return false;
    }
}

// Function to send all notifications (email, SMS, and WhatsApp)
async function sendAppointmentNotifications(patientEmail, patientPhone, doctorEmail, appointmentDetails) {
    // Send emails
    const emailResult = await sendAppointmentEmails(patientEmail, doctorEmail, appointmentDetails);

    // Prepare notification message
    const patientMessage = `
Your appointment has been scheduled:
Doctor: ${appointmentDetails.doctor_name}
Specialization: ${appointmentDetails.specialization}
Date: ${new Date(appointmentDetails.appointment_date).toLocaleDateString()}
Time: ${appointmentDetails.appointment_time}
Location: Medical Center, Main Street
Please arrive 10 minutes early.
`;

    const doctorMessage = `
New appointment scheduled:
Patient: ${appointmentDetails.patient_name}
Date: ${new Date(appointmentDetails.appointment_date).toLocaleDateString()}
Time: ${appointmentDetails.appointment_time}
Patient Phone: ${appointmentDetails.phone}
Symptoms: ${appointmentDetails.symptoms}
`;

    // Format phone numbers
    const formattedPatientPhone = formatPhoneNumber(patientPhone);
    const formattedDoctorPhone = formatPhoneNumber(appointmentDetails.doctor_phone);

    // Send SMS notifications
    const patientSMSResult = await sendSMSNotification(formattedPatientPhone, patientMessage);
    const doctorSMSResult = await sendSMSNotification(formattedDoctorPhone, doctorMessage);

    // Send WhatsApp notifications
    const patientWhatsAppResult = await sendWhatsAppMessage(formattedPatientPhone, patientMessage);
    const doctorWhatsAppResult = await sendWhatsAppMessage(formattedDoctorPhone, doctorMessage);

    return {
        email: emailResult,
        sms: {
            patient: patientSMSResult,
            doctor: doctorSMSResult
        },
        whatsapp: {
            patient: patientWhatsAppResult,
            doctor: doctorWhatsAppResult
        }
    };
}

// Routes
// Main routes
app.get('/successful.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'successful.html'));
});

app.get('/our_services.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'our_services.html'));
});

// Admin routes
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin_login.html'));
});

app.get('/admin/dashboard', isAdmin, (req, res) => {
    res.render('admin-dashboard', {
        user: {
            name: 'Admin',
            role: 'admin'
        }
    });
});

app.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;

    try {
    if (email === 'admin@hospital.com' && password === 'admin123') {
            req.session.userId = 'admin';
        req.session.role = 'admin';
            req.session.name = 'Admin';
            
            // Add this for debugging
            console.log('Admin login successful:', {
                session: req.session,
                userId: req.session.userId,
                role: req.session.role
            });

            return res.json({ 
                success: true, 
                redirect: '/admin/dashboard'
            });
        }
        
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin API routes
app.get('/api/admin/stats', async (req, res) => {
    try {
        // Get all stats in parallel using Promise.all
        const [doctorsCount] = await pool.query(
            'SELECT COUNT(*) as count FROM doctors'
        );

        const [patientsCount] = await pool.query(
            'SELECT COUNT(*) as count FROM patients'
        );

        const [appointmentsCount] = await pool.query(
            'SELECT COUNT(*) as count FROM appointments'
        );

        const [pendingCount] = await pool.query(
            'SELECT COUNT(*) as count FROM appointments WHERE status = "pending"'
        );

        res.json({
            totalDoctors: doctorsCount[0].count,
            totalPatients: patientsCount[0].count,
            totalAppointments: appointmentsCount[0].count,
            pendingAppointments: pendingCount[0].count
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ error: 'Error fetching statistics' });
    }
});

// Get doctor credentials (only for admin)
app.get('/api/admin/doctor-credentials', (req, res) => {
    pool.query('SELECT name, email, original_password, specialization FROM doctors', (error, results) => {
        if (error) {
            console.error("Error fetching doctor credentials:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
        res.json(results);
    });
});

app.get('/api/admin/doctors', async (req, res) => {
    try {
        const [doctors] = await pool.query(`
            SELECT 
                d.id,
                d.specialization,
                d.qualification,
                d.experience_years,
                d.consultation_fee,
                u.first_name,
                u.last_name,
                u.email,
                u.phone
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE u.role = 'doctor'
            ORDER BY u.first_name, u.last_name
        `);
        
        res.json(doctors);
    } catch (error) {
            console.error('Error fetching doctors:', error);
        res.status(500).json({ error: 'Error fetching doctors' });
        }
});

// Get all patients (admin only)
app.get('/api/admin/patients', async (req, res) => {
    try {
        const [patients] = await pool.query(`
            SELECT 
                p.id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone,
                u.created_at
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE u.role = 'patient'
            ORDER BY u.created_at DESC
        `);
        
        res.json(patients);
    } catch (error) {
            console.error('Error fetching patients:', error);
        res.status(500).json({ error: 'Error fetching patients' });
        }
});

// Get all appointments (admin only)
app.get('/api/admin/appointments', async (req, res) => {
    try {
        const [appointments] = await pool.query(`
        SELECT 
            a.id,
            a.appointment_date,
            a.appointment_time,
            a.status,
                CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
                CONCAT(du.first_name, ' ', du.last_name) as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
            JOIN users pu ON p.user_id = pu.id
        JOIN doctors d ON a.doctor_id = d.id
            JOIN users du ON d.user_id = du.id
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
        `);
    
        res.json(appointments);
    } catch (error) {
            console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Error fetching appointments' });
        }
});

// Update appointment status (admin only)
app.put('/api/admin/appointments/:id/status', isAdmin, async (req, res) => {
    try {
        const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
        const newStatus = req.body.status;

        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const [result] = await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            [newStatus, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        // Get appointment details for notification
        const [[appointment]] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [req.params.id]
        );

        if (appointment) {
            try {
                // Get patient email
                const [[patient]] = await pool.query(
                    'SELECT u.email FROM users u JOIN patients p ON u.id = p.user_id WHERE p.id = ?',
                    [appointment.patient_id]
                );

                if (patient) {
                    await sendAppointmentStatusUpdate(appointment, patient.email, newStatus);
                }
            } catch (notificationError) {
                console.error('Error sending status update notification:', notificationError);
                // Continue with the response even if notification fails
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.post('/api/admin/doctors', (req, res) => {
    const { name, email, phone, specialization, password } = req.body;
    
    // Store the original password in a separate column
    const hashedPassword = bcrypt.hash(password, 10);
    
    pool.query(
        'INSERT INTO doctors (name, email, phone, specialization, password, original_password) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, phone, specialization, hashedPassword, password],
        (error, results) => {
            if (error) {
                console.error('Error adding doctor:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
            res.status(201).json({ id: results.insertId });
        }
    );
});

app.delete('/api/admin/doctors/:id', (req, res) => {
    pool.query('DELETE FROM doctors WHERE id = ?', [req.params.id], (error) => {
        if (error) {
            console.error('Error deleting doctor:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json({ message: 'Doctor deleted successfully' });
    });
});

// API endpoint to get all doctors
app.get('/api/doctors', async (req, res) => {
    try {
        let query = `
            SELECT 
                d.id as doctor_id,
                d.specialization,
                d.qualification,
                d.experience_years,
                d.consultation_fee,
                u.first_name,
                u.last_name,
                u.email,
                u.phone
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE u.role = 'doctor'
        `;
        
        const params = [];
        if (req.query.specialization) {
            query += ` AND LOWER(d.specialization) = LOWER(?)`;
            params.push(req.query.specialization);
        }

        console.log('Executing query:', query, 'with params:', params);
        
        const [doctors] = await pool.query(query, params);
        console.log('Found doctors:', doctors);

        res.json({ doctors });
    } catch (error) {
            console.error('Error fetching doctors:', error);
        res.status(500).json({ error: 'Error fetching doctors' });
        }
});

app.get("/login1", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/register-patient", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register-patient.html"));
});

app.get("/register-doctor", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register-doctor.html"));
});

app.post("/register-patient", async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, gender, dob, bloodGroup, address } = req.body;
        console.log('Received patient registration:', { firstName, lastName, email });

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // First create user
            const hashedPassword = await bcrypt.hash(password, 10);
            const [userResult] = await connection.query(
                `INSERT INTO users (first_name, last_name, email, phone, password, role, gender) 
                 VALUES (?, ?, ?, ?, ?, 'patient', ?)`,
                [firstName, lastName, email, phone, hashedPassword, gender]
            );

            // Then create patient record
            await connection.query(
                `INSERT INTO patients (user_id, dob, blood_group, address)
                 VALUES (?, ?, ?, ?)`,
                [userResult.insertId, dob || new Date(), bloodGroup || 'Not Specified', address || '']
            );

            await connection.commit();
            console.log('Patient registration successful:', userResult.insertId);

            // Send welcome email
            const emailTemplate = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Welcome to Doctor Healthcare',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #12ac8e;">Welcome to Doctor Healthcare!</h2>
                        <p>Dear ${firstName} ${lastName},</p>
                        <p>Thank you for registering with us. Your account has been created successfully.</p>
                        <p>You can now log in and book appointments with our doctors.</p>
                        <p>Best regards,<br>DoctorHealthcare Team</p>
                    </div>
                `
            };

            await transporter.sendMail(emailTemplate);

            res.json({ 
                success: true, 
                message: 'Registration successful',
                redirect: '/login'
            });

    } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error in patient registration:', error);
        res.status(500).json({ 
            error: 'Registration failed. Please try again.' 
        });
    }
});

app.post('/register-doctor', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Get all form data
        const {
            first_name,
            last_name,
            email,
            phone,
            password,
            specialization,
            qualification,
            license_number,
            experience_years,
            consultation_fee, // Add this line
            gender
        } = req.body;

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // First create user entry
        const [userResult] = await connection.query(
            'INSERT INTO users (first_name, last_name, email, phone, password, role, gender) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [first_name, last_name, email, phone, hashedPassword, 'doctor', gender]
        );

        // Then create doctor entry with all required fields
        const [doctorResult] = await connection.query(`
            INSERT INTO doctors (
                user_id,
                first_name,
                last_name,
                email,
                phone,
                password,
                gender,
                specialization,
                qualification,
                license_number,
                experience_years,
                consultation_fee
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userResult.insertId,
                first_name,
                last_name,
                email,
                phone,
                hashedPassword,
                gender,
                specialization,
                qualification,
                license_number,
                experience_years,
                consultation_fee || 1000 // Use provided fee or default to 1000
            ]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'Doctor registration successful'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error in doctor registration:', error);
        
        let errorMessage = 'Registration failed';
        if (error.code === 'ER_DUP_ENTRY') {
            errorMessage = 'Email already registered';
        } else if (error.code === 'ER_BAD_NULL_ERROR') {
            const missingField = error.sqlMessage.match(/'([^']+)'/)?.[1] || 'required field';
            errorMessage = `Please fill in the ${missingField}`;
        }
        
        res.status(500).json({ 
            error: errorMessage,
            details: error.message
        });
    } finally {
        connection.release();
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ error: "Error logging out" });
        }
        res.redirect('/');
    });
});

// Auth check route
app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.userId) {
        res.status(200).json({ authenticated: true });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// Patient Routes
// Serve static dashboard files
app.get('/api/doctor/appointments', async (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.status(403).json({ error: "Not authorized" });
    }

    try {
    const { date, status } = req.query;
    let query = `
            SELECT a.*, 
                   CONCAT(p_u.first_name, ' ', p_u.last_name) as patient_name,
                   p_u.email as patient_email,
                   p_u.phone as patient_phone
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
            JOIN users p_u ON p.user_id = p_u.id
        WHERE a.doctor_id = ?
    `;
    const params = [req.session.userId];

    if (date) {
        query += ` AND DATE(a.appointment_date) = ?`;
        params.push(date);
    }
    if (status) {
        query += ` AND a.status = ?`;
        params.push(status);
    }

    query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;

        const [appointments] = await pool.query(query, params);
        res.json({ appointments });
    } catch (error) {
        console.error("Error fetching appointments:", error);
        res.status(500).json({ error: "Error fetching appointments" });
    }
});

// Patient's Appointments API
app.get("/api/patient/appointments", isAuthenticated, async (req, res) => {
    try {
        const filter = req.query.filter || 'all'; // all, upcoming, past
        const userId = req.session.userId;

        let query = `
            SELECT 
                a.*,
                CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
                d.specialization,
                CONCAT(pu.first_name, ' ', pu.last_name) as patient_name
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users du ON d.user_id = du.id
            JOIN patients p ON a.patient_id = p.id
            JOIN users pu ON p.user_id = pu.id
            WHERE p.user_id = ?
        `;

        if (filter === 'upcoming') {
            query += ` AND a.appointment_date >= CURDATE()`;
        } else if (filter === 'past') {
            query += ` AND a.appointment_date < CURDATE()`;
        }

        query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;

        const [appointments] = await pool.query(query, [userId]);
        res.json({ appointments });

    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// Available Doctors API
app.get("/api/doctors", (req, res) => {
    const { specialization, date } = req.query;
    let query = `
        SELECT d.*, 
            (SELECT AVG(rating) FROM reviews WHERE doctor_id = d.id) as rating,
            (SELECT COUNT(*) FROM reviews WHERE doctor_id = d.id) as reviews
        FROM doctors d 
        WHERE d.active = 1
    `;
    const params = [];

    if (specialization) {
        query += ` AND LOWER(d.specialization) = LOWER(?)`;
        params.push(specialization);
    }

    pool.query(query, params, (err, doctors) => {
        if (err) {
            console.error("Error fetching doctors:", err);
            return res.status(500).json({ error: "Error fetching doctors" });
        }

        // If date is provided, check availability
        if (date) {
            const doctorIds = doctors.map(d => d.id);
            const availabilityQuery = `
                SELECT doctor_id, COUNT(*) as booked_slots
                FROM appointments
                WHERE doctor_id IN (?) AND appointment_date = ?
                GROUP BY doctor_id
            `;

            pool.query(availabilityQuery, [doctorIds, date], (err, availability) => {
                if (err) {
                    console.error("Error checking availability:", err);
                    return res.status(500).json({ error: "Error checking availability" });
                }

                const availabilityMap = new Map(availability.map(a => [a.doctor_id, a.booked_slots]));
                doctors.forEach(doctor => {
                    doctor.available_slots = 8 - (availabilityMap.get(doctor.id) || 0);
                });

                res.json({ doctors });
            });
        } else {
            res.json({ doctors });
        }
    });
});

// Doctor's Time Slots API
app.get("/api/doctors/:id/time-slots", (req, res) => {
    const doctorId = req.params.id;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: "Date is required" });
    }

    const query = `
        SELECT appointment_time
        FROM appointments
        WHERE doctor_id = ? AND appointment_date = ?
    `;

    pool.query(query, [doctorId, date], (err, bookedSlots) => {
        if (err) {
            console.error("Error fetching time slots:", err);
            return res.status(500).json({ error: "Error fetching time slots" });
        }

        const bookedTimes = new Set(bookedSlots.map(slot => slot.appointment_time));
        const availableSlots = [];
        
        // Generate time slots from 9 AM to 5 PM
        for (let hour = 9; hour < 17; hour++) {
            const time = `${hour.toString().padStart(2, '0')}:00:00`;
            availableSlots.push({
                time,
                available: !bookedTimes.has(time)
            });
        }

        res.json({ timeSlots: availableSlots });
    });
});

// Update Profile APIs
app.post("/api/doctor/update-profile", (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.status(403).json({ error: "Not authorized" });
    }

    const { name, phone, specialization } = req.body;
    
    pool.query(
        "UPDATE doctors SET name = ?, phone = ?, specialization = ? WHERE id = ?",
        [name, phone, specialization, req.session.userId],
        (err, result) => {
            if (err) {
                console.error("Error updating profile:", err);
                return res.status(500).json({ error: "Error updating profile" });
            }
            res.json({ success: true });
        }
    );
});

app.post("/api/patient/update-profile", (req, res) => {
    if (req.session.role !== 'patient') {
        return res.status(403).json({ error: "Not authorized" });
    }

    const { name, phone, address } = req.body;
    
    pool.query(
        "UPDATE patients SET name = ?, phone = ?, address = ? WHERE id = ?",
        [name, phone, address, req.session.userId],
        (err, result) => {
            if (err) {
                console.error("Error updating profile:", err);
                return res.status(500).json({ error: "Error updating profile" });
            }
            res.json({ success: true });
        }
    );
});

// Change Password API
app.post("/api/change-password", async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const table = req.session.role === 'doctor' ? 'doctors' : 'patients';

    try {
        // Verify current password
        const [user] = await pool.query(`SELECT password FROM ${table} WHERE id = ?`, [req.session.userId]);
        
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        await pool.query(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashedPassword, req.session.userId]);
        
        res.json({ success: true });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ error: "Error changing password" });
    }
});

// Appointment Routes
app.get('/doctor-appointment-form', (req, res) => {
    if (req.session.role !== 'patient') {
        return res.redirect('/login');
    }

    try {
        // Get patient details
        const patientQuery = 'SELECT * FROM patients WHERE id = ?';
        // Get available doctors
        const doctorsQuery = `
            SELECT d.*, 
                (SELECT AVG(rating) FROM reviews WHERE doctor_id = d.id) as rating,
                (SELECT COUNT(*) FROM reviews WHERE doctor_id = d.id) as reviews
            FROM doctors d 
            WHERE d.active = 1
            ORDER BY d.name
        `;

        pool.query(patientQuery + ';' + doctorsQuery, [req.session.userId], (err, results) => {
            if (err) {
                console.error('Error fetching appointment form data:', err);
                return res.status(500).send('Error loading appointment form');
            }

            const [patientResults, doctorsResults] = results;

            if (!patientResults || patientResults.length === 0) {
                return res.redirect('/login');
            }

            res.render('doctor_appointment_form', {
                patient: patientResults[0],
                doctors: doctorsResults || []
            });
        });
    } catch (error) {
        console.error('Error in appointment form:', error);
        res.status(500).send('Error loading appointment form');
    }
});

// API route for doctor time slots
app.get('/api/doctors/:doctorId/time-slots', (req, res) => {
    const doctorId = req.params.doctorId;
    const date = req.query.date;

    if (!doctorId || !date) {
        return res.status(400).json({ error: 'Doctor ID and date are required' });
    }

    try {
        // Get doctor's schedule
        const scheduleQuery = `
            SELECT time_slot, COUNT(a.id) as booked
            FROM (
                SELECT TIME_FORMAT('09:00:00', '%H:%i') as time_slot
                UNION SELECT TIME_FORMAT('09:30:00', '%H:%i')
                UNION SELECT TIME_FORMAT('10:00:00', '%H:%i')
                UNION SELECT TIME_FORMAT('10:30:00', '%H:%i')
                UNION SELECT TIME_FORMAT('11:00:00', '%H:%i')
                UNION SELECT TIME_FORMAT('11:30:00', '%H:%i')
                UNION SELECT TIME_FORMAT('12:00:00', '%H:%i')
                UNION SELECT TIME_FORMAT('14:00:00', '%H:%i')
                UNION SELECT TIME_FORMAT('14:30:00', '%H:%i')
                UNION SELECT TIME_FORMAT('15:00:00', '%H:%i')
                UNION SELECT TIME_FORMAT('15:30:00', '%H:%i')
                UNION SELECT TIME_FORMAT('16:00:00', '%H:%i')
                UNION SELECT TIME_FORMAT('16:30:00', '%H:%i')
            ) ts
            LEFT JOIN appointments a ON 
                a.doctor_id = ? AND 
                DATE(a.appointment_date) = ? AND 
                TIME_FORMAT(a.appointment_time, '%H:%i') = ts.time_slot
            GROUP BY time_slot
            ORDER BY time_slot
        `;

        pool.query(scheduleQuery, [doctorId, date], (err, results) => {
            if (err) {
                console.error('Error fetching time slots:', err);
                return res.status(500).json({ error: "Error fetching time slots" });
            }

            const timeSlots = results.map(slot => ({
                time: slot.time_slot,
                available: slot.booked === 0
            }));

            res.json({ timeSlots });
        });
    } catch (error) {
        console.error('Error in time slots API:', error);
        res.status(500).json({ error: "Error fetching time slots" });
    }
});

// Book appointment API
app.post('/api/appointments', isAuthenticated, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { doctor_id, appointment_date, appointment_time, symptoms } = req.body;
        const patient_id = req.session.userId;

        console.log('\n=== New Appointment Booking ===');
        console.log('Booking details:', { doctor_id, appointment_date, appointment_time, symptoms });

        await connection.beginTransaction();

        // Get patient details
        const [patientDetails] = await connection.query(`
            SELECT u.first_name, u.last_name, u.email, p.id as patient_id
            FROM users u
            JOIN patients p ON u.id = p.user_id
            WHERE u.id = ?
        `, [patient_id]);

        // Get doctor details
        const [doctorDetails] = await connection.query(`
            SELECT u.first_name, u.last_name, u.email, d.specialization
            FROM users u
            JOIN doctors d ON u.id = d.user_id
            WHERE d.id = ?
        `, [doctor_id]);

        // Create appointment
        const [result] = await connection.query(
            `INSERT INTO appointments (patient_id, doctor_id, appointment_date, 
                appointment_time, symptoms, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [patientDetails[0].patient_id, doctor_id, appointment_date, appointment_time, symptoms]
        );

        await connection.commit();

        // Send confirmation emails
        try {
            // Send to patient
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: patientDetails[0].email,
                subject: 'Appointment Confirmation',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #12ac8e;">Appointment Confirmation</h2>
                        <p>Dear ${patientDetails[0].first_name} ${patientDetails[0].last_name},</p>
                        <p>Your appointment has been scheduled successfully.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">Appointment Details:</h3>
                            <p><strong>Doctor:</strong> Dr. ${doctorDetails[0].first_name} ${doctorDetails[0].last_name}</p>
                            <p><strong>Specialization:</strong> ${doctorDetails[0].specialization}</p>
                            <p><strong>Date:</strong> ${new Date(appointment_date).toLocaleDateString()}</p>
                            <p><strong>Time:</strong> ${appointment_time}</p>
                            <p><strong>Status:</strong> Pending confirmation</p>
                        </div>

                        <p>Please wait for the doctor's confirmation. You will receive another email once the appointment is confirmed.</p>
                        <p style="color: #666;">Best regards,<br>DoctorHealthcare Team</p>
                    </div>
                `
            });
            console.log('Patient confirmation email sent');

            // Send to doctor
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: doctorDetails[0].email,
                subject: 'New Appointment Request',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #12ac8e;">New Appointment Request</h2>
                        <p>Dear Dr. ${doctorDetails[0].first_name} ${doctorDetails[0].last_name},</p>
                        <p>You have a new appointment request.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">Appointment Details:</h3>
                            <p><strong>Patient:</strong> ${patientDetails[0].first_name} ${patientDetails[0].last_name}</p>
                            <p><strong>Date:</strong> ${new Date(appointment_date).toLocaleDateString()}</p>
                            <p><strong>Time:</strong> ${appointment_time}</p>
                            <p><strong>Symptoms:</strong> ${symptoms || 'None specified'}</p>
                        </div>

                        <p>Please login to your dashboard to confirm or reschedule this appointment.</p>
                        <p style="color: #666;">Best regards,<br>DoctorHealthcare Team</p>
                    </div>
                `
            });
            console.log('Doctor notification email sent');

        } catch (emailError) {
            console.error('Error sending emails:', emailError);
            // Don't throw error, continue with response
        }

                                    res.json({ 
                                        success: true, 
                                        message: 'Appointment booked successfully',
                                        appointmentId: result.insertId
                                    });

    } catch (error) {
        await connection.rollback();
        console.error('Error booking appointment:', error);
        res.status(500).json({ error: 'Failed to book appointment' });
    } finally {
        connection.release();
    }
});

// Add this route to get patient appointments
app.get('/api/patient/appointments', isAuthenticated, async (req, res) => {
    try {
        const filter = req.query.filter || 'upcoming';
        const userId = req.session.userId;

        // Get patient ID from users table
        const [[patient]] = await pool.query(
            'SELECT p.id FROM patients p WHERE p.user_id = ?',
            [userId]
        );

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        let query = `
            SELECT 
                a.*,
                CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
                d.specialization
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users du ON d.user_id = du.id
            WHERE a.patient_id = ?
        `;

        if (filter === 'upcoming') {
            query += ` AND a.appointment_date >= CURDATE()`;
        } else if (filter === 'past') {
            query += ` AND a.appointment_date < CURDATE()`;
        }

        query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;

        const [appointments] = await pool.query(query, [patient.id]);
        res.json({ appointments });

    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});
/*
// Update appointment status
app.put('/api/appointments/:id/status', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Check if the appointment belongs to the logged-in doctor
        const [appointments] = await pool.query(`
            SELECT a.*, d.user_id as doctor_user_id 
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = ?
        `, [id]);

        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        if (appointments[0].doctor_user_id !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized to update this appointment' });
        }

        // Update the appointment status
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});
*/
app.put('/api/appointments/:id/status', isAuthenticated, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const [appointments] = await connection.query(`
            SELECT a.*, d.user_id as doctor_user_id, u.email as patient_email 
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users u ON a.patient_id = u.id
            WHERE a.id = ?`, [id]);

        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        const appointment = appointments[0];
        if (appointment.doctor_user_id !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized to update this appointment' });
        }

        await connection.beginTransaction();
        await connection.query('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);
        
        try {
            await sendAppointmentStatusUpdate(appointment, appointment.patient_email, status);
        } catch (error) {
            console.error('Error sending notification:', error);
        }

        await connection.commit();
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    } finally {
        connection.release();
    }
});
// Cancel appointment
app.post("/cancel-appointment/:id", (req, res) => {
    const appointmentId = req.params.id;
    
    pool.query(
        "UPDATE appointments SET status = 'cancelled' WHERE id = ? AND (email = ? OR doctor = ?)",
        [appointmentId, req.session.email, req.session.name],
        (err, result) => {
            if (err) {
                console.error("Error cancelling appointment:", err);
                return res.status(500).json({ success: false });
            }
            if (result.affectedRows === 0) {
                return res.status(403).json({ success: false });
            }
            res.json({ success: true });
        }
    );
});

// Doctor Availability Routes
app.get("/doctor/availability", (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.redirect('/login');
    }

    pool.query(
        `SELECT a.*, d.consultation_duration, d.max_patients_per_day 
         FROM doctor_availability a 
         JOIN doctors d ON d.id = a.doctor_id 
         WHERE d.id = ?`,
        [req.session.userId],
        (err, results) => {
            if (err) {
                console.error("Error fetching availability:", err);
                return res.status(500).send("Error fetching availability");
            }

            const availability = results || [];
            const consultation_duration = results.length > 0 ? results[0].consultation_duration : 30;
            const max_patients_per_day = results.length > 0 ? results[0].max_patients_per_day : 20;

            res.render('doctor_availability', {
                name: req.session.name,
                availability: availability,
                consultation_duration: consultation_duration,
                max_patients_per_day: max_patients_per_day
            });
        }
    );
});

// Update doctor availability
app.post("/doctor/availability", (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.status(403).json({ success: false });
    }

    const { day_of_week, start_time, end_time, break_start, break_end } = req.body;

    pool.query(
        `INSERT INTO doctor_availability 
         (doctor_id, day_of_week, start_time, end_time, break_start, break_end) 
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         start_time = VALUES(start_time),
         end_time = VALUES(end_time),
         break_start = VALUES(break_start),
         break_end = VALUES(break_end)`,
        [req.session.userId, day_of_week, start_time, end_time, break_start, break_end],
        (err) => {
            if (err) {
                console.error("Error updating availability:", err);
                return res.status(500).json({ success: false });
            }
            res.json({ success: true });
        }
    );
});

// API route to get all doctors
app.get("/api/doctors", (req, res) => {
    pool.query(
        "SELECT id, name, specialization, experience FROM doctors",
        (err, doctors) => {
            if (err) {
                console.error("Error fetching doctors:", err);
                return res.status(500).json({ error: "Error fetching doctors" });
            }
            res.json({ doctors });
        }
    );
});

// Patient profile API
app.get("/api/patient/profile", (req, res) => {
    pool.query(
        "SELECT name, email, phone, created_at FROM patients WHERE id = ?",
        [req.session.userId],
        (err, results) => {
            if (err) {
                console.error("Error fetching patient profile:", err);
                return res.status(500).json({ error: "Error fetching profile" });
            }
            if (results.length === 0) {
                return res.status(404).json({ error: "Patient not found" });
            }
            res.json(results[0]);
        }
    );
});

// Patient appointments API
app.get("/api/patient/appointments", (req, res) => {
    pool.query(
        `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
                d.name as doctor_name, d.specialization
         FROM appointments a
         JOIN doctors d ON a.doctor_id = d.id
         WHERE a.patient_id = ?
         ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
        [req.session.userId],
        (err, appointments) => {
            if (err) {
                console.error("Error fetching appointments:", err);
                return res.status(500).json({ error: "Error fetching appointments" });
            }
            res.json({ appointments });
        }
    );
});

// Prescription routes
app.post('/api/prescriptions', (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.status(403).json({ error: 'Only doctors can create prescriptions' });
    }
    // PrescriptionController.createPrescription(req, res);
});

app.get('/api/prescriptions/:id', (req, res) => {
    // PrescriptionController.getPrescription(req, res);
});

app.get('/api/patients/:patientId/prescriptions', (req, res) => {
    // PrescriptionController.getPatientPrescriptions(req, res);
});

app.put('/api/prescriptions/:id', (req, res) => {
    if (req.session.role !== 'doctor') {
        return res.status(403).json({ error: 'Only doctors can update prescriptions' });
    }
    // PrescriptionController.updatePrescription(req, res);
});

// Function to send cancellation email
async function sendCancellationEmail(appointment) {
    try {
        const emailSubject = 'Appointment Cancellation Notice';
        const emailBody = `
Dear ${appointment.name},

Your appointment scheduled for ${appointment.date} at ${appointment.time} with ${appointment.doctor} has been cancelled.

If this cancellation was made by the doctor, you will be contacted shortly to reschedule.
If you cancelled this appointment and wish to reschedule, please book a new appointment through our system.

Thank you for your understanding.

Best regards,
Hospital Management`;

        // await transporter.sendMail({
        //     from: process.env.EMAIL_USER,
        //     to: appointment.email,
        //     subject: emailSubject,
        //     text: emailBody
        // });

        console.log('Cancellation email sent to:', appointment.email);
        return true;
    } catch (error) {
        console.error('Error sending cancellation email:', error);
        return false;
    }
}

// Handle appointment cancellation
app.put('/api/appointments/:id/cancel', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        
        // First check if the appointment belongs to the logged-in patient
        const [appointments] = await pool.query(
            'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
            [id, req.session.userId]
        );

        if (appointments.length === 0) {
            return res.status(403).json({ error: 'Not authorized to cancel this appointment' });
        }

        const appointment = appointments[0];

        // Check if appointment can be cancelled (is pending or confirmed)
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            return res.status(400).json({ 
                error: 'Cannot cancel appointment with current status: ' + appointment.status 
            });
        }

        // Update the appointment status to cancelled
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', id]
        );

        // Get doctor and patient details for notification
        const [[doctorDetails], [patientDetails]] = await Promise.all([
            pool.query(`
                SELECT u.email, CONCAT(d.first_name, ' ', d.last_name) as name
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                WHERE d.id = ?
            `, [appointment.doctor_id]),
            pool.query(`
                SELECT u.email, CONCAT(p.first_name, ' ', p.last_name) as name
                FROM patients p
                JOIN users u ON p.user_id = u.id
                WHERE p.id = ?
            `, [appointment.patient_id])
        ]);

        // Send cancellation notifications
        if (doctorDetails && patientDetails) {
            try {
                await sendAppointmentStatusUpdate(
                    appointment,
                    patientDetails.email,
                    'cancelled'
                );
            } catch (error) {
                console.error('Error sending cancellation notification:', error);
                // Don't fail the request if notification fails
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ error: 'Failed to cancel appointment' });
    }
});

// Patient medical reports API
app.get("/api/patient/reports", (req, res) => {
    pool.query(
        `SELECT r.id, r.title, r.date, d.name as doctor_name
         FROM medical_reports r
         JOIN doctors d ON r.doctor_id = d.id
         WHERE r.patient_id = ?
         ORDER BY r.date DESC`,
        [req.session.userId],
        (err, reports) => {
            if (err) {
                console.error("Error fetching medical reports:", err);
                return res.status(500).json({ error: "Error fetching reports" });
            }
            res.json({ reports });
        }
    );
});

// Logout endpoint

// Create a test doctor account
app.get('/create-test-doctor', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash('doctor123', 10);
        
        // First, check if the doctor already exists
        pool.query(
            'SELECT id FROM doctors WHERE email = ?',
            ['dr.brown@example.com'],
            (err, results) => {
                if (err) {
                    console.error('Error checking doctor:', err);
                    return res.status(500).send('Error checking doctor');
                }

                if (results.length > 0) {
                    // Update existing doctor's password
                    pool.query(
                        'UPDATE doctors SET password = ? WHERE email = ?',
                        [hashedPassword, 'dr.brown@example.com'],
                        (err, result) => {
                            if (err) {
                                console.error('Error updating doctor:', err);
                                return res.status(500).send('Error updating doctor');
                            }
                            res.send('Doctor password updated successfully');
                        }
                    );
                } else {
                    // Create new doctor
                    pool.query(
                        'INSERT INTO doctors (name, email, password, specialization, phone) VALUES (?, ?, ?, ?, ?)',
                        ['Dr. Emily Brown', 'dr.brown@example.com', hashedPassword, 'Dentist', '3456789012'],
                        (err, result) => {
                            if (err) {
                                console.error('Error creating doctor:', err);
                                return res.status(500).send('Error creating doctor');
                            }
                            res.send('Doctor created successfully');
                        }
                    );
                }
            }
        );
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).send('Error creating/updating doctor');
    }
});

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('error', { message: 'Page not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { message: 'Something broke! Please try again later.' });
});

// Test email route
app.get('/test-email', async (req, res) => {
    try {
        console.log('\n=== Testing Email Configuration ===');
        console.log('Email User:', process.env.EMAIL_USER);
        console.log('Email Pass:', process.env.EMAIL_PASS ? 'Set' : 'Not Set');

        const testResult = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send to yourself
            subject: 'Test Email',
            html: '<h1>Test Email</h1><p>If you receive this, your email configuration is working!</p>'
        });

        console.log('✓ Test email sent successfully!');
        console.log('Message ID:', testResult.messageId);
        res.send('Test email sent! Check your inbox.');
    } catch (error) {
        console.error('✗ Email test failed:', error);
        res.status(500).send(`Email test failed: ${error.message}`);
    }
});

// Doctors directory API
app.get('/api/doctors-directory', async (req, res) => {
    try {
        const specialization = req.query.specialization;
        let query = `
            SELECT 
                d.id,
                d.specialization,
                d.qualification,
                d.experience_years,
                d.consultation_fee,
                u.first_name,
                u.last_name,
                u.gender,
                u.email
            FROM doctors d
            JOIN users u ON d.user_id = u.id
        `;

        if (specialization && specialization !== 'all') {
            query += ' WHERE d.specialization = ?';
        }

        const [doctors] = await pool.query(query, specialization !== 'all' ? [specialization] : []);
        res.json({ doctors });
    } catch (error) {
        console.error('Error fetching doctors:', error);
        res.status(500).json({ error: 'Failed to fetch doctors' });
    }
});

// Add this temporary route to create doctor accounts
app.get('/setup-doctor-accounts', async (req, res) => {
    try {
        const doctors = [
            {
                firstName: 'John',
                lastName: 'Smith',
                email: 'dr.smith@hospital.com',
                phone: '9876543210',
                gender: 'male',
                specialization: 'Cardiologist',
                qualification: 'MD, DM Cardiology',
                experience_years: 15,
                consultation_fee: 1000
            },
            {
                firstName: 'Sarah',
                lastName: 'Johnson',
                email: 'dr.johnson@hospital.com',
                phone: '9876543211',
                gender: 'female',
                specialization: 'Dermatologist',
                qualification: 'MD Dermatology',
                experience_years: 8,
                consultation_fee: 800
            },
            {
                firstName: 'David',
                lastName: 'Kumar',
                email: 'dr.kumar@hospital.com',
                phone: '9876543212',
                gender: 'male',
                specialization: 'Pediatrician',
                qualification: 'MD Pediatrics',
                experience_years: 12,
                consultation_fee: 700
            },
            {
                firstName: 'Emily',
                lastName: 'Chen',
                email: 'dr.chen@hospital.com',
                phone: '9876543213',
                gender: 'female',
                specialization: 'Neurologist',
                qualification: 'MD, DM Neurology',
                experience_years: 10,
                consultation_fee: 1200
            },
            {
                firstName: 'Michael',
                lastName: 'Patel',
                email: 'dr.patel@hospital.com',
                phone: '9876543214',
                gender: 'male',
                specialization: 'Orthopedic',
                qualification: 'MS Orthopedics',
                experience_years: 14,
                consultation_fee: 900
            }
        ];

        const hashedPassword = await bcrypt.hash('Doctor@123', 10);

        for (const doctor of doctors) {
        // Insert user
            const [userResult] = await pool.query(
                `INSERT INTO users (first_name, last_name, email, phone, password, role, gender) 
                 VALUES (?, ?, ?, ?, ?, 'doctor', ?)`,
                [doctor.firstName, doctor.lastName, doctor.email, 
                 doctor.phone, hashedPassword, doctor.gender]
            );

            // Insert doctor details
        await pool.query(
                `INSERT INTO doctors (user_id, specialization, qualification, 
                                        experience_years, consultation_fee)
                 VALUES (?, ?, ?, ?, ?)`,
                [userResult.insertId, doctor.specialization, doctor.qualification,
                 doctor.experience_years, doctor.consultation_fee]
        );
        }

        res.json({ message: 'Doctor accounts created successfully' });
    } catch (error) {
        console.error('Error creating doctor accounts:', error);
        res.status(500).json({ error: 'Error creating doctor accounts' });
    }
});

// Add this temporary route to check doctor accounts
app.get('/check-doctor-accounts', async (req, res) => {
    try {
        const [doctors] = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.password,
                d.specialization
            FROM users u
            JOIN doctors d ON u.id = d.user_id
            WHERE u.role = 'doctor'
        `);
        res.json({ doctors });
    } catch (error) {
        console.error('Error checking doctor accounts:', error);
        res.status(500).json({ error: 'Error checking doctor accounts' });
    }
});

// Add this temporary route to reset password
app.get('/reset-password', async (req, res) => {
    try {
        const email = req.query.email;
        const newPassword = 'Patient@123'; // Default password
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const [result] = await pool.query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});
/*
// Add this route to handle report generation
app.post('/api/admin/reports', isAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { type, startDate, endDate } = req.body;

        if (!type || !startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        let data = {
            type,
            startDate,
            endDate
        };

        if (type === 'appointments') {
            const [results] = await connection.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                    SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END) as noShow
                FROM appointments
                WHERE DATE(appointment_date) BETWEEN ? AND ?
            `, [startDate, endDate]);

            data = {
                ...data,
                totalAppointments: results[0].total,
                completed: results[0].completed,
                cancelled: results[0].cancelled,
                noShow: results[0].noShow
            };
        } else if (type === 'doctors') {
            const [results] = await connection.query(`
                SELECT 
                    CONCAT(d.first_name, ' ', d.last_name) as name,
                    COUNT(*) as totalAppointments,
                    SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                    ROUND((SUM(CASE WHEN a.status = 'no-show' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as noShowRate
                FROM appointments a
                JOIN doctors d ON a.doctor_id = d.id
                WHERE DATE(a.appointment_date) BETWEEN ? AND ?
                GROUP BY d.id, d.first_name, d.last_name
            `, [startDate, endDate]);

            console.log('Doctor results:', results);
            data.doctors = results || [];
        } else if (type === 'patients') {
            const [results] = await pool.query(`
                SELECT 
                    COUNT(DISTINCT p.id) as totalPatients,
                    COUNT(DISTINCT CASE WHEN p.created_at BETWEEN ? AND ? THEN p.id END) as newPatients,
                    ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT p.id), 2) as avgAppointments
                FROM patients p
                JOIN appointments a ON p.id = a.patient_id
                WHERE DATE(a.appointment_date) BETWEEN ? AND ?
            `, [startDate, endDate, startDate, endDate]);

            console.log('Patient results:', results[0]);

            data = {
                ...data,
                totalPatients: results[0].totalPatients,
                newPatients: results[0].newPatients,
                avgAppointments: results[0].avgAppointments
            };
        }

        res.json(data);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    } finally {
        connection.release();
    }
});
*/
app.post('/api/admin/reports', isAdmin, async (req, res) => {
    let connection;
    try {
        const { type, startDate, endDate } = req.body;

        if (!type || !startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        connection = await pool.getConnection();

        let data = {
            type,
            startDate,
            endDate
        };

        if (type === 'appointments') {
            const [results] = await connection.query(`
                SELECT 
                    COUNT(*) as total,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
                    COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
                    COALESCE(SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END), 0) as noShow
                FROM appointments
                WHERE DATE(appointment_date) BETWEEN ? AND ?
            `, [startDate, endDate]);

            console.log('Appointment results:', results[0]);

            data = {
                ...data,
                totalAppointments: results[0].total,
                completed: results[0].completed,
                cancelled: results[0].cancelled,
                noShow: results[0].noShow
            };
        } else if (type === 'doctors') {
            const [results] = await connection.query(`
                SELECT 
                    CONCAT(u.first_name, ' ', u.last_name) as name,
                    COUNT(a.id) as totalAppointments,
                    COALESCE(SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
                    COALESCE(SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
                    COALESCE(ROUND(SUM(CASE WHEN a.status = 'no-show' THEN 1 ELSE 0 END) * 100.0 / 
                        NULLIF(COUNT(a.id), 0), 0), 0) as noShowRate
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                LEFT JOIN appointments a ON d.id = a.doctor_id 
                    AND DATE(a.appointment_date) BETWEEN ? AND ?
                GROUP BY d.id, u.first_name, u.last_name
            `, [startDate, endDate]);

            console.log('Doctor results:', results);
            data.doctors = results || [];
        } else if (type === 'patients') {
            const [results] = await pool.query(`
                SELECT 
                    COUNT(DISTINCT u.id) as totalPatients,
                    COALESCE(SUM(CASE WHEN u.created_at BETWEEN ? AND ? THEN 1 ELSE 0 END), 0) as newPatients,
                    COALESCE(ROUND(COUNT(a.id) * 1.0 / NULLIF(COUNT(DISTINCT u.id), 0), 0), 0) as avgAppointments
                FROM users u
                JOIN patients p ON u.id = p.user_id
                LEFT JOIN appointments a ON p.id = a.patient_id 
                    AND DATE(a.appointment_date) BETWEEN ? AND ?
                WHERE u.role = 'patient'
            `, [startDate, endDate, startDate, endDate]);

            console.log('Patient results:', results[0]);

            data = {
                ...data,
                totalPatients: results[0].totalPatients,
                newPatients: results[0].newPatients,
                avgAppointments: results[0].avgAppointments
            };
        } else {
            return res.status(400).json({ error: 'Invalid report type' });
        }

        res.json(data);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Add these routes before module.exports
app.delete('/api/admin/doctors/:id', async (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Get user_id from doctors table
        const [doctor] = await connection.query(
            'SELECT user_id FROM doctors WHERE id = ?',
            [req.params.id]
        );

        if (doctor.length === 0) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        // Delete from doctors table
        await connection.query('DELETE FROM doctors WHERE id = ?', [req.params.id]);
        
        // Delete from users table
        await connection.query('DELETE FROM users WHERE id = ?', [doctor[0].user_id]);

        await connection.commit();
        res.json({ success: true });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting doctor:', error);
        res.status(500).json({ error: 'Failed to delete doctor' });
    } finally {
        connection.release();
    }
});

app.put('/api/admin/appointments/:id/status', isAdmin, async (req, res) => {
    try {
        const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
        const newStatus = req.body.status;

        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const [result] = await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            [newStatus, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        // Get appointment details for notification
        const [[appointment]] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [req.params.id]
        );

        if (appointment) {
            try {
                // Get patient email
                const [[patient]] = await pool.query(
                    'SELECT u.email FROM users u JOIN patients p ON u.id = p.user_id WHERE p.id = ?',
                    [appointment.patient_id]
                );

                if (patient) {
                    await sendAppointmentStatusUpdate(appointment, patient.email, newStatus);
                }
            } catch (notificationError) {
                console.error('Error sending status update notification:', notificationError);
                // Continue with the response even if notification fails
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.post('/api/admin/reset-doctor-passwords', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        // Set default password
        const defaultPassword = 'Doctor@123';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // Update all doctor passwords
        await connection.query(`
            UPDATE users u
            JOIN doctors d ON u.id = d.user_id
            SET u.password = ?
            WHERE u.role = 'doctor'
        `, [hashedPassword]);

        // Get updated doctor list
        const [doctors] = await connection.query(`
            SELECT 
                u.email,
                u.first_name,
                u.last_name,
                d.specialization
            FROM users u
            JOIN doctors d ON u.id = d.user_id
            WHERE u.role = 'doctor'
        `);

        res.json({
            message: "All doctor passwords have been reset. Use these credentials to login:",
            doctors: doctors.map(doc => ({
                name: `Dr. ${doc.first_name} ${doc.last_name}`,
                email: doc.email,
                password: defaultPassword,
                specialization: doc.specialization
            }))
        });

    } catch (error) {
        console.error('Error resetting doctor passwords:', error);
        res.status(500).json({ error: 'Failed to reset passwords' });
    } finally {
        connection.release();
    }
});

app.post('/api/admin/reset-doctor-password', async (req, res) => {
    try {
        const { email } = req.body;
        const newPassword = 'Doctor@123';
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const [result] = await pool.query(
            'UPDATE users SET password = ? WHERE email = ? AND role = "doctor"',
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        res.json({
            success: true,
            message: 'Password reset successful',
            credentials: {
                email: email,
                password: newPassword
            }
        });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Add this diagnostic route
app.get('/api/check-doctor-credentials', async (req, res) => {
    try {
        const [doctors] = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.password,
                u.first_name,
                u.last_name,
                d.specialization
            FROM users u
            JOIN doctors d ON u.id = d.user_id
            WHERE u.role = 'doctor'
        `);

        // Reset Dr. Rajesh's password specifically
        const hashedPassword = await bcrypt.hash('Doctor@123', 10);
        await pool.query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, 'dr.rajesh@hospital.com']
        );

        res.json({
            message: "Doctor credentials have been checked and reset",
            defaultPassword: 'Doctor@123',
            doctors: doctors.map(doc => ({
                id: doc.id,
                name: `Dr. ${doc.first_name} ${doc.last_name}`,
                email: doc.email,
                specialization: doc.specialization
            }))
        });

    } catch (error) {
        console.error('Error checking credentials:', error);
        res.status(500).json({ error: 'Failed to check credentials' });
    }
});

// Add this route to handle appointment status updates
app.put('/api/appointments/:id/status', isDoctor, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            [status, id]
        );

        // If appointment is confirmed, send notification to patient
        if (status === 'confirmed') {
            const [appointment] = await pool.query(`
                SELECT a.*, u.email, u.phone
                FROM appointments a
                JOIN patients p ON a.patient_id = p.id
                JOIN users u ON p.user_id = u.id
                WHERE a.id = ?
            `, [id]);

            if (appointment.length > 0) {
                // Send email notification
                await sendAppointmentConfirmationEmail(appointment[0]);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({ error: 'Failed to update appointment status' });
    }
});

// Add this route to handle appointment cancellation
app.put('/api/appointments/:id/cancel', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        
        // First check if the appointment belongs to the logged-in patient
        const [appointments] = await pool.query(
            'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
            [id, req.session.userId]
        );

        if (appointments.length === 0) {
            return res.status(403).json({ error: 'Not authorized to cancel this appointment' });
        }

        const appointment = appointments[0];

        // Check if appointment can be cancelled (is pending or confirmed)
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            return res.status(400).json({ 
                error: 'Cannot cancel appointment with current status: ' + appointment.status 
            });
        }

        // Update the appointment status to cancelled
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', id]
        );

        // Optionally, send cancellation notification to doctor
        const [doctorDetails] = await pool.query(`
            SELECT u.email 
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE d.id = ?
        `, [appointment.doctor_id]);

        if (doctorDetails.length > 0) {
            // Send email notification to doctor about cancellation
            // await sendAppointmentCancellationEmail(doctorDetails[0].email, appointment);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ error: 'Failed to cancel appointment' });
    }
});

app.put('/api/appointments/:id/cancel', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        
        // First check if the appointment belongs to the logged-in patient
        const [appointments] = await pool.query(
            'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
            [id, req.session.userId]
        );

        if (appointments.length === 0) {
            return res.status(403).json({ error: 'Not authorized to cancel this appointment' });
        }

        const appointment = appointments[0];

        // Check if appointment can be cancelled (is pending or confirmed)
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            return res.status(400).json({ 
                error: 'Cannot cancel appointment with current status: ' + appointment.status 
            });
        }

        // Update the appointment status to cancelled
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', id]
        );

        // Get doctor and patient details for notification
        const [[doctorDetails], [patientDetails]] = await Promise.all([
            pool.query(`
                SELECT u.email, CONCAT(d.first_name, ' ', d.last_name) as name
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                WHERE d.id = ?
            `, [appointment.doctor_id]),
            pool.query(`
                SELECT u.email, CONCAT(p.first_name, ' ', p.last_name) as name
                FROM patients p
                JOIN users u ON p.user_id = u.id
                WHERE p.user_id = ?
            `, [req.session.userId])
        ]);

        // Send cancellation notifications
        if (doctorDetails && patientDetails) {
            try {
                await sendAppointmentStatusUpdate(
                    appointment,
                    patientDetails.email,
                    'cancelled'
                );
            } catch (error) {
                console.error('Error sending cancellation notification:', error);
                // Don't fail the request if notification fails
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ error: 'Failed to cancel appointment' });
    }
});

// Export the app at the end of app.js
module.exports = app;