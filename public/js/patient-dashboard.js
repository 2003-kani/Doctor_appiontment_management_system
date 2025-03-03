$(document).ready(function() {
    // Navigation handling
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

    // Load initial data
    loadOverviewData();
    loadAppointments('upcoming');
    loadMedicalRecords();

    // Appointment filters
    $('.appointments-filter button').click(function() {
        $('.appointments-filter button').removeClass('active');
        $(this).addClass('active');
        loadAppointments($(this).data('filter'));
    });

    // Profile form submission
    $('#profileForm').submit(function(e) {
        e.preventDefault();
        updateProfile();
    });

    // Appointment booking form
    $('#appointmentForm').submit(function(e) {
        e.preventDefault();
        bookAppointment();
    });

    // Load doctors for appointment booking
    loadDoctors();

    loadDoctorsDirectory();
    
    // Handle specialization filter clicks
    $('.specialization-filter button').click(function() {
        $('.specialization-filter button').removeClass('active');
        $(this).addClass('active');
        const filter = $(this).data('filter');
        loadDoctorsDirectory(filter);
    });

    // Update the specialization dropdown
    $('#specializationSelect').html(`
        <option value="">Choose Specialization</option>
        <option value="General Physician">General Physician</option>
        <option value="Cardiologist">Cardiologist</option>
        <option value="Dermatologist">Dermatologist</option>
        <option value="Neurologist">Neurologist</option>
        <option value="Pediatrician">Pediatrician</option>
        <option value="Orthopedic">Orthopedic</option>
        <option value="Gynecologist">Gynecologist</option>
        <option value="Dentist">Dentist</option>
    `);

    // Update the doctor selection handler
    $('#specializationSelect').change(function() {
        const specialization = $(this).val();
        console.log('Selected specialization:', specialization);
        
        if (!specialization) {
            $('#doctorSelect').html('<option value="">First select specialization</option>');
            $('#doctorInfo').hide();
            return;
        }

        // Fetch doctors for selected specialization
        $.get(`/api/doctors?specialization=${encodeURIComponent(specialization)}`, function(data) {
            console.log('Received doctors data:', data);
            
            if (data.doctors && data.doctors.length > 0) {
                const options = data.doctors.map(doctor => 
                    `<option value="${doctor.doctor_id}" 
                        data-experience="${doctor.experience_years}"
                        data-qualification="${doctor.qualification}"
                        data-fee="${doctor.consultation_fee}">
                        Dr. ${doctor.first_name} ${doctor.last_name}
                    </option>`
                ).join('');
                
                $('#doctorSelect').html('<option value="">Select Doctor</option>' + options);
            } else {
                $('#doctorSelect').html('<option value="">No doctors available for this specialization</option>');
            }
        }).fail(function(error) {
            console.error('Error fetching doctors:', error);
            $('#doctorSelect').html('<option value="">Error loading doctors</option>');
        });
    });

    // Update the doctor selection handler
    $('#doctorSelect').change(function() {
        const selectedDoctor = $(this).val();
        console.log('Selected doctor:', selectedDoctor);
        
        if (selectedDoctor) {
            const $selected = $(this).find(':selected');
            $('#doctorExperience').text($selected.data('experience'));
            $('#doctorQualification').text($selected.data('qualification'));
            $('#consultationFee').text($selected.data('fee'));
            $('#doctorInfo').show();
            loadAvailableTimeSlots();
        } else {
            $('#doctorInfo').hide();
        }
    });
});

// Load overview data
function loadOverviewData() {
    $.get('/api/patient/overview', function(data) {
        $('#upcomingAppointmentsCount').text(data.upcomingAppointments);
        $('#pastAppointmentsCount').text(data.pastAppointments);
        $('#medicalRecordsCount').text(data.medicalRecords);
        
        // Load recent appointments
        const recentHtml = data.recentAppointments.map(appointment => `
            <div class="appointment-card">
                <h3>Dr. ${appointment.doctor_name}</h3>
                <p>Date: ${new Date(appointment.appointment_date).toLocaleDateString()}</p>
                <p>Time: ${appointment.appointment_time}</p>
                <p>Status: <span class="status-${appointment.status.toLowerCase()}">${appointment.status}</span></p>
            </div>
        `).join('');
        
        $('#recentAppointmentsList').html(recentHtml);
    });
}

// Load appointments based on filter
function loadAppointments(filter = 'all') {
    $.get(`/api/patient/appointments?filter=${filter}`, function(data) {
        const appointmentsContainer = $('#appointments-container');
        appointmentsContainer.empty();

        if (data.length === 0) {
            appointmentsContainer.html(`
                <div class="text-center p-4">
                    <i class="fas fa-calendar-times fa-3x text-muted mb-3"></i>
                    <h5>No ${filter} appointments found</h5>
                </div>
            `);
            return;
        }

        data.forEach(appointment => {
            const appointmentDate = new Date(appointment.appointment_date);
            const formattedDate = appointmentDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const statusColors = {
                pending: 'warning',
                confirmed: 'success',
                cancelled: 'danger',
                completed: 'info'
            };

            const card = `
                <div class="col-md-6 mb-4">
                    <div class="card h-100 shadow-sm">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="card-title mb-0">
                                    <i class="fas fa-user-md text-primary me-2"></i>
                                    Dr. ${appointment.doctor_first_name} ${appointment.doctor_last_name}
                                </h5>
                                <span class="badge bg-${statusColors[appointment.status] || 'secondary'}">
                                    ${appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                                </span>
                            </div>
                            
                            <div class="mb-3">
                                <p class="text-muted mb-1">
                                    <i class="fas fa-stethoscope me-2"></i>
                                    ${appointment.specialization}
                                </p>
                                <p class="text-muted mb-1">
                                    <i class="far fa-calendar-alt me-2"></i>
                                    ${formattedDate}
                                </p>
                                <p class="text-muted mb-1">
                                    <i class="far fa-clock me-2"></i>
                                    ${appointment.appointment_time}
                                </p>
                                <p class="text-muted mb-0">
                                    <i class="fas fa-dollar-sign me-2"></i>
                                    Consultation Fee: ₹${appointment.consultation_fee}
                                </p>
                            </div>

                            ${appointment.status === 'pending' ? `
                                <div class="d-flex justify-content-end">
                                    <button class="btn btn-danger btn-sm" 
                                            onclick="cancelAppointment(${appointment.id})">
                                        <i class="fas fa-times me-1"></i> Cancel
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            appointmentsContainer.append(card);
        });
    }).fail(function(error) {
        console.error('Error loading appointments:', error);
        showAlert('error', 'Failed to load appointments. Please try again.');
    });
}

// Filter appointments
$('.appointment-filter').click(function() {
    $('.appointment-filter').removeClass('active');
    $(this).addClass('active');
    loadAppointments($(this).data('filter'));
});

// Initial load
loadAppointments('upcoming');

// Cancel appointment function
function cancelAppointment(appointmentId) {
    if (confirm('Are you sure you want to cancel this appointment?')) {
        $.ajax({
            url: `/api/appointments/${appointmentId}/cancel`,
            method: 'PUT',
            success: function(response) {
                if (response.success) {
                    showAlert('success', 'Appointment cancelled successfully');
                    loadAppointments($('.appointment-filter.active').data('filter'));
                } else {
                    showAlert('error', response.error || 'Error cancelling appointment');
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON ? xhr.responseJSON.error : 'Error cancelling appointment. Please try again.';
                showAlert('error', errorMsg);
                console.error('Error:', xhr.responseText);
            }
        });
    }
}

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
    
    // Add the new alert at the top of the appointments section
    $('#appointments').prepend(alertHtml);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        $('.alert').fadeOut('slow', function() {
            $(this).remove();
        });
    }, 5000);
}

// Load medical records
function loadMedicalRecords() {
    $.get('/api/patient/medical-records', function(data) {
        const recordsHtml = data.records.map(record => `
            <div class="medical-record">
                <h3>Visit on ${new Date(record.date).toLocaleDateString()}</h3>
                <p><strong>Doctor:</strong> Dr. ${record.doctor_name}</p>
                <p><strong>Diagnosis:</strong> ${record.diagnosis}</p>
                <p><strong>Prescription:</strong> ${record.prescription}</p>
            </div>
        `).join('');
        
        $('#medicalRecordsList').html(recordsHtml || '<p>No medical records found.</p>');
    });
}

// Update profile
function updateProfile() {
    const data = {
        phone: $('#phone').val(),
        address: $('#address').val()
    };

    $.ajax({
        url: '/api/patient/profile',
        method: 'PUT',
        data: data,
        success: function(response) {
            alert('Profile updated successfully!');
        },
        error: function() {
            alert('Error updating profile. Please try again.');
        }
    });
}

// Load doctors for appointment booking
function loadDoctors() {
    $('#specializationSelect').change(function() {
        const specialization = $(this).val();
        console.log('Selected specialization:', specialization);
        
        if (!specialization) {
            $('#doctorSelect').html('<option value="">First select specialization</option>');
            $('#doctorInfo').hide();
            return;
        }

        $.get(`/api/doctors?specialization=${encodeURIComponent(specialization)}`, function(data) {
            console.log('Received doctors data:', data);
            
            if (data.doctors && data.doctors.length > 0) {
                const options = data.doctors.map(doctor => 
                    `<option value="${doctor.doctor_id}" 
                        data-experience="${doctor.experience_years}"
                        data-qualification="${doctor.qualification}"
                        data-fee="${doctor.consultation_fee}">
                        Dr. ${doctor.first_name} ${doctor.last_name}
                    </option>`
                ).join('');
                
                $('#doctorSelect').html('<option value="">Select Doctor</option>' + options);
            } else {
                $('#doctorSelect').html('<option value="">No doctors available for this specialization</option>');
            }
        }).fail(function(error) {
            console.error('Error fetching doctors:', error);
            $('#doctorSelect').html('<option value="">Error loading doctors</option>');
        });
    });

    $('#doctorSelect').change(function() {
        const $selected = $(this).find(':selected');
        if ($selected.val()) {
            $('#doctorExperience').text($selected.data('experience'));
            $('#doctorQualification').text($selected.data('qualification'));
            $('#consultationFee').text($selected.data('fee'));
            $('#doctorInfo').show();
            loadAvailableTimeSlots();
        } else {
            $('#doctorInfo').hide();
        }
    });

    // Add date change handler
    $('#appointmentDate').change(loadAvailableTimeSlots);
}

// Add function to load available time slots
function loadAvailableTimeSlots() {
    const doctorId = $('#doctorSelect').val();
    const date = $('#appointmentDate').val();
    
    if (!doctorId || !date) return;

    $.get(`/api/doctors/${doctorId}/available-slots?date=${date}`, function(data) {
        const timeSlots = data.availableSlots.map(slot => 
            `<option value="${slot.time}" ${!slot.available ? 'disabled' : ''}>
                ${slot.time} ${!slot.available ? '(Booked)' : ''}
            </option>`
        ).join('');
        
        $('#appointmentTime').html('<option value="">Select Time Slot</option>' + timeSlots);
    });
}

// Update the appointment booking function
function bookAppointment() {
    // Get form data
    const formData = {
        doctor_id: parseInt($('#doctorSelect').val()),
        appointment_date: $('#appointmentDate').val(),
        appointment_time: $('#appointmentTime').val(),
        symptoms: $('#symptoms').val() || ''
    };

    // Log form data for debugging
    console.log('Booking appointment with data:', formData);

    // Validate required fields
    if (!formData.doctor_id) {
        alert('Please select a doctor');
        return;
    }
    if (!formData.appointment_date) {
        alert('Please select an appointment date');
        return;
    }
    if (!formData.appointment_time) {
        alert('Please select an appointment time');
        return;
    }

    // Show loading state
    const submitButton = $('#appointmentForm button[type="submit"]');
    submitButton.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span> Booking...');

    // Make the AJAX request
    $.ajax({
        url: '/api/appointments',
        method: 'POST',
        data: formData,
        success: function(response) {
            if (response.success) {
                alert('Appointment booked successfully! Check your email for confirmation.');
                $('#appointmentForm')[0].reset();
                $('#doctorInfo').hide();
                loadAppointments('upcoming');
                loadOverviewData();
            } else {
                alert('Failed to book appointment: ' + response.error);
            }
        },
        error: function(xhr, status, error) {
            console.error('Booking error:', xhr.responseJSON);
            alert('Error booking appointment: ' + (xhr.responseJSON?.error || error));
        },
        complete: function() {
            submitButton.prop('disabled', false).text('Book Appointment');
        }
    });
}

// Add this to ensure form fields are properly populated
$('#doctorSelect').change(function() {
    console.log('Selected doctor ID:', $(this).val());
});

$('#appointmentDate').change(function() {
    console.log('Selected date:', $(this).val());
});

$('#appointmentTime').change(function() {
    console.log('Selected time:', $(this).val());
});

// Add this function to handle appointment cancellation
function cancelAppointment(appointmentId) {
    if (confirm('Are you sure you want to cancel this appointment?')) {
        $.ajax({
            url: `/api/appointments/${appointmentId}/cancel`,
            method: 'PUT',
            success: function(response) {
                if (response.success) {
                    showAlert('success', 'Appointment cancelled successfully');
                    loadAppointments('all'); // Reload appointments instead of full page
                } else {
                    showAlert('error', response.error || 'Error cancelling appointment');
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON ? xhr.responseJSON.error : 'Error cancelling appointment. Please try again.';
                showAlert('error', errorMsg);
                console.error('Error:', xhr.responseText);
            }
        });
    }
}

// Add this new function
function loadDoctorsDirectory(specialization = 'all') {
    $.get(`/api/doctors-directory${specialization !== 'all' ? '?specialization=' + specialization : ''}`, function(data) {
        const doctorsHtml = data.doctors.map(doctor => {
            // Determine appropriate image based on gender and doctor ID
            let imageUrl;
            if (doctor.gender === 'female') {
                // Use different female doctor images based on ID
                imageUrl = `/images/doctors/female-doctor-${(doctor.id % 3) + 1}.jpg`;
            } else {
                // Use different male doctor images based on ID
                imageUrl = `/images/doctors/male-doctor-${(doctor.id % 3) + 1}.jpg`;
            }

            // Fallback to default images if custom image doesn't exist
            const fallbackImage = doctor.gender === 'female' 
                ? '/images/default-female-doctor.png'
                : '/images/default-male-doctor.png';

            return `
                <div class="doctor-card">
                    <img src="${imageUrl}" 
                         onerror="this.onerror=null; this.src='${fallbackImage}'" 
                         alt="Dr. ${doctor.first_name}" 
                         class="doctor-image">
                    <h3 class="doctor-name">Dr. ${doctor.first_name} ${doctor.last_name}</h3>
                    <p class="doctor-specialization">${doctor.specialization}</p>
                    
                    <div class="doctor-info-grid">
                        <div class="doctor-info-item">
                            <strong>Experience</strong>
                            ${doctor.experience_years} years
                        </div>
                        <div class="doctor-info-item">
                            <strong>Qualification</strong>
                            ${doctor.qualification}
                        </div>
                        <div class="doctor-info-item">
                            <strong>Languages</strong>
                            ${doctor.languages || 'English'}
                        </div>
                        <div class="doctor-info-item">
                            <strong>Fee</strong>
                            ₹${doctor.consultation_fee}
                        </div>
                    </div>

                    <div class="doctor-actions">
                        <button class="btn btn-outline-primary" onclick="viewDoctorProfile(${doctor.id})">
                            <i class="fas fa-user-md"></i> View Profile
                        </button>
                        <button class="btn btn-primary" onclick="bookWithDoctor(${doctor.id})">
                            <i class="fas fa-calendar-plus"></i> Book Now
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        $('#doctorsGrid').html(doctorsHtml || '<p>No doctors found.</p>');
    });
}

function viewDoctorProfile(doctorId) {
    // Open doctor's detailed profile in a modal
    $.get(`/api/doctors/${doctorId}/profile`, function(data) {
        // Show modal with doctor's detailed information
        showDoctorProfileModal(data);
    });
}

function bookWithDoctor(doctorId) {
    // Switch to appointment booking section and pre-select the doctor
    $('.nav-links li').removeClass('active');
    $('[data-section="book-appointment"]').addClass('active');
    $('.dashboard-section').removeClass('active');
    $('#book-appointment').addClass('active');
    
    // Pre-select the doctor's specialization and the doctor
    const $doctorOption = $(`#doctorSelect option[value="${doctorId}"]`);
    const specialization = $doctorOption.closest('optgroup').attr('label');
    
    $('#specializationSelect').val(specialization).trigger('change');
    setTimeout(() => {
        $('#doctorSelect').val(doctorId).trigger('change');
    }, 100);
} 