$(document).ready(function() {
    // Navigation
    $('.nav-links li').click(function(e) {
        if (!$(this).hasClass('active') && !$(this).find('a').attr('href').startsWith('/')) {
            e.preventDefault();
            $('.nav-links li').removeClass('active');
            $(this).addClass('active');
            
            const section = $(this).data('section');
            $('.dashboard-section').removeClass('active');
            $(`#${section}`).addClass('active');
        }
    });

    // Appointment filtering
    $('.appointments-filter button').click(function() {
        const filter = $(this).data('filter');
        $('.appointments-filter button').removeClass('active');
        $(this).addClass('active');

        loadAppointments(filter);
    });

    // Trigger upcoming filter by default
    $('.appointments-filter button[data-filter="upcoming"]').click();
});
/*
// Appointment status update function
function updateAppointmentStatus(appointmentId, status) {
    if (confirm(`Are you sure you want to ${status} this appointment?`)) {
        $.ajax({
            url: `/api/appointments/${appointmentId}/status`,
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ status: status }),
            success: function(response) {
                if (response.success) {
                    alert(response.message || 'Appointment status updated successfully');
                    loadAppointments('all'); // Reload appointments instead of full page refresh
                } else {
                    alert(response.error || 'Error updating appointment status');
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON ? xhr.responseJSON.error : 'Error updating appointment status. Please try again.';
                alert(errorMsg);
                console.error('Error:', xhr.responseText);
            }
        });
    }
} */
    function updateAppointmentStatus(appointmentId, status) {
        if (confirm(`Are you sure you want to ${status} this appointment?`)) {
            $.ajax({
                url: `/api/appointments/${appointmentId}/status`,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ status: status }),
                success: function(response) {
                    if (response.success) {
                        alert(response.message || 'Status updated successfully');
                        loadAppointments('all');
                    } else {
                        alert(response.error || 'Error updating status');
                    }
                },
                error: function(xhr) {
                    const errorMsg = xhr.responseJSON ? 
                        xhr.responseJSON.error : 
                        'Error updating status. Please try again.';
                    alert(errorMsg);
                    console.error('Error:', xhr.responseText);
                }
            });
        }
    }

// Function to load appointments
function loadAppointments(filter = 'all') {
    $.ajax({
        url: '/api/doctor/appointments',
        method: 'GET',
        data: { filter: filter },
        success: function(response) {
            if (response.success) {
                const appointmentsTable = $('#appointments-table tbody');
                appointmentsTable.empty();
                
                response.appointments.forEach(appointment => {
                    const row = createAppointmentRow(appointment);
                    appointmentsTable.append(row);
                });
            } else {
                console.error('Failed to load appointments:', response.error);
            }
        },
        error: function(xhr) {
            console.error('Error loading appointments:', xhr.responseText);
        }
    });
}

// Helper function to create appointment row
function createAppointmentRow(appointment) {
    const date = new Date(appointment.appointment_date).toLocaleDateString();
    const statusBadgeClass = getStatusBadgeClass(appointment.status);
    
    return `
        <tr class="appointment-row ${isUpcoming(appointment.appointment_date) ? 'upcoming' : 'past'}">
            <td>${date}</td>
            <td>${appointment.appointment_time}</td>
            <td>${appointment.patient_name}</td>
            <td><span class="status-badge ${statusBadgeClass}">${appointment.status}</span></td>
            <td>${appointment.symptoms || 'Not specified'}</td>
            <td>
                ${getActionButtons(appointment)}
            </td>
        </tr>
    `;
}

// Helper function to get status badge class
function getStatusBadgeClass(status) {
    const classes = {
        'pending': 'badge-warning',
        'confirmed': 'badge-primary',
        'completed': 'badge-success',
        'cancelled': 'badge-danger',
        'no-show': 'badge-secondary'
    };
    return classes[status] || 'badge-light';
}

// Helper function to get action buttons based on appointment status
function getActionButtons(appointment) {
    if (appointment.status === 'pending') {
        return `
            <button onclick="updateAppointmentStatus(${appointment.id}, 'confirmed')" class="btn btn-sm btn-success">Confirm</button>
            <button onclick="updateAppointmentStatus(${appointment.id}, 'cancelled')" class="btn btn-sm btn-danger">Cancel</button>
        `;
    } else if (appointment.status === 'confirmed') {
        return `
            <button onclick="updateAppointmentStatus(${appointment.id}, 'completed')" class="btn btn-sm btn-success">Complete</button>
            <button onclick="updateAppointmentStatus(${appointment.id}, 'no-show')" class="btn btn-sm btn-warning">No Show</button>
        `;
    }
    return '';
}

// Helper function to check if appointment is upcoming
function isUpcoming(date) {
    return new Date(date) >= new Date(new Date().setHours(0, 0, 0, 0));
}

loadAppointments('all');