// Patient's Appointments API
app.get("/api/patient/appointments", isAuthenticated, async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
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

// Appointment cancellation route
app.put('/api/appointments/:id/cancel', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        
        // First check if the appointment belongs to the logged-in patient
        const [appointments] = await pool.query(
            'SELECT * FROM appointments WHERE id = ? AND patient_id IN (SELECT id FROM patients WHERE user_id = ?)',
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
                SELECT u.email, CONCAT(u.first_name, ' ', u.last_name) as name
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                WHERE d.id = ?
            `, [appointment.doctor_id]),
            pool.query(`
                SELECT u.email, CONCAT(u.first_name, ' ', u.last_name) as name
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
