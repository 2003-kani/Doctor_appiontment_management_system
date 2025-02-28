const Prescription = require('../../models/prescriptions/prescription');

class PrescriptionController {
    static async createPrescription(req, res) {
        try {
            const { appointment_id, medications, instructions, diagnosis } = req.body;
            
            if (!appointment_id || !medications || !diagnosis) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const prescriptionData = {
                appointment_id,
                doctor_id: req.session.userId,
                patient_id: req.body.patient_id,
                medications,
                instructions,
                diagnosis
            };

            const prescriptionId = await Prescription.create(prescriptionData);
            res.status(201).json({ 
                message: 'Prescription created successfully',
                prescriptionId 
            });
        } catch (error) {
            console.error('Error creating prescription:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getPrescription(req, res) {
        try {
            const prescriptionId = req.params.id;
            const prescription = await Prescription.findById(prescriptionId);
            
            if (!prescription) {
                return res.status(404).json({ error: 'Prescription not found' });
            }

            // Check if the user has permission to view this prescription
            if (req.session.role === 'doctor' && prescription.doctor_id !== req.session.userId) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }
            
            if (req.session.role === 'patient' && prescription.patient_id !== req.session.userId) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            res.json(prescription);
        } catch (error) {
            console.error('Error fetching prescription:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getPatientPrescriptions(req, res) {
        try {
            const patientId = req.params.patientId;
            
            // Check if the user has permission to view these prescriptions
            if (req.session.role === 'patient' && patientId !== req.session.userId) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            const prescriptions = await Prescription.findByPatientId(patientId);
            res.json(prescriptions);
        } catch (error) {
            console.error('Error fetching patient prescriptions:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async updatePrescription(req, res) {
        try {
            const prescriptionId = req.params.id;
            const prescription = await Prescription.findById(prescriptionId);
            
            if (!prescription) {
                return res.status(404).json({ error: 'Prescription not found' });
            }

            // Only the prescribing doctor can update the prescription
            if (prescription.doctor_id !== req.session.userId) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            const { medications, instructions, diagnosis } = req.body;
            
            if (medications) prescription.medications = medications;
            if (instructions) prescription.instructions = instructions;
            if (diagnosis) prescription.diagnosis = diagnosis;

            await prescription.update();
            res.json({ 
                message: 'Prescription updated successfully',
                prescription 
            });
        } catch (error) {
            console.error('Error updating prescription:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = PrescriptionController;
