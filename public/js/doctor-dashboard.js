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

// Helper function to show alerts
function showAlert(type, message) {
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    const alertHtml = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    // Remove any existing alerts
    $('.alert').remove();
    
    // Add the new alert at the top of the current section
    $('.dashboard-section.active').prepend(alertHtml);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        $('.alert').fadeOut('slow', function() {
            $(this).remove();
        });
    }, 5000);
}

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
                    showAlert('success', `Appointment ${status} successfully`);
                    loadAppointments('all'); // Reload appointments
                } else {
                    showAlert('error', response.error || `Error ${status}ing appointment`);
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON ? xhr.responseJSON.error : `Error ${status}ing appointment. Please try again.`;
                showAlert('error', errorMsg);
                console.error('Error:', xhr.responseText);
            }
        });
    }
}

// Function to cancel appointment (for consistency with patient dashboard)
function cancelAppointment(appointmentId) {
    updateAppointmentStatus(appointmentId, 'cancelled');
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
                
                if (response.appointments.length === 0) {
                    appointmentsTable.html(`
                        <tr>
                            <td colspan="6" class="text-center">
                                <div class="p-3">
                                    <i class="fas fa-calendar-times fa-3x text-muted mb-3"></i>
                                    <h5 class="text-muted">No ${filter} appointments found</h5>
                                </div>
                            </td>
                        </tr>
                    `);
                } else {
                    response.appointments.forEach(appointment => {
                        const row = createAppointmentRow(appointment);
                        appointmentsTable.append(row);
                    });
                }
            } else {
                console.error('Failed to load appointments:', response.error);
                showAlert('error', 'Failed to load appointments');
            }
        },
        error: function(xhr) {
            console.error('Error loading appointments:', xhr.responseText);
            showAlert('error', 'Error loading appointments. Please try again.');
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
            <button onclick="cancelAppointment(${appointment.id})" class="btn btn-sm btn-danger">Cancel</button>
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