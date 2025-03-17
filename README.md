# Doctor Appointment Management System

A comprehensive web application for managing doctor appointments, patient records, and medical prescriptions.

## Features

### For Patients
- Book appointments with specialized doctors
- View and manage upcoming/past appointments
- Access medical history and prescriptions
- Real-time availability checking for doctors
- Receive email confirmations for appointments

### For Doctors
- Manage daily appointment schedule
- View patient details and medical history
- Write and manage prescriptions
- Set availability and break times
- Handle appointment status (confirm/cancel/complete)

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript, Bootstrap 5
- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Template Engine**: EJS
- **Authentication**: JWT (JSON Web Tokens)

## Prerequisites

- Node.js (v14 or higher)
- MySQL Server
- npm (Node Package Manager)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Doctor_appiontment_management_system.git
   cd Doctor_appiontment_management_system
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   - Create a MySQL database
   - Import the schema from `config/setup_database.sql`
   - Configure database connection in `config/database.js`

4. Start the application:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── assets/           # Static assets (images)
├── config/           # Database and configuration files
├── controllers/      # Business logic
├── middlewares/      # Authentication middleware
├── public/           # Public assets (CSS, JS, images)
├── routes/           # API routes
├── views/            # EJS templates
└── app.js           # Main application file
```

## Key Features Implementation

### Appointment Booking System
- Real-time availability checking
- Automatic time slot management
- Email notifications
- Status tracking (pending/confirmed/cancelled/completed)

### Doctor Management
- Specialization-based doctor listing
- Availability management
- Patient history access
- Prescription writing interface

### Patient Dashboard
- Appointment history
- Medical records access
- Prescription viewing
- Profile management

## Security Features

- JWT-based authentication
- Password encryption
- Role-based access control
- Session management

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the GitHub repository or contact the development team.