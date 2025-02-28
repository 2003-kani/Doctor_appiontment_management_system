const Doctor = require('../models/Doctor');

const createDoctor = async (req, res) => {
    const { user_id, specialization } = req.body;
    try {
        const doctor_id = await Doctor.createDoctor(user_id, specialization);
        res.status(201).json({ message: 'Doctor created successfully', doctor_id });
    } catch (error) {
        res.status(500).json({ message: 'Error creating doctor', error });
    }
};

const getDoctors = async (req, res) => {
    try {
        const doctors = await Doctor.getDoctors();
        res.status(200).json(doctors);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching doctors', error });
    }
};

module.exports = { createDoctor, getDoctors };