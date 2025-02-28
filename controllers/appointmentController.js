const Appointment = require('../models/Appointment');

const createAppointment = async (req, res) => {
    const { patient_id, doctor_id, date, time } = req.body;
    try {
        const appointment_id = await Appointment.createAppointment(patient_id, doctor_id, date, time);
        res.status(201).json({ message: 'Appointment created successfully', appointment_id });
    } catch (error) {
        res.status(500).json({ message: 'Error creating appointment', error });
    }
};

const getAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.getAppointments();
        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching appointments', error });
    }
};

module.exports = { createAppointment, getAppointments };