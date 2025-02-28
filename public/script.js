// Handle Registration Form Submission
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    alert(result.message);
    if (response.ok) {
        window.location.href = '/login'; // Redirect to login page after successful registration
    }
});

// Handle Login Form Submission
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    alert(result.message);
    if (response.ok) {
        localStorage.setItem('token', result.token); // Store the token in localStorage
        window.location.href = '/'; // Redirect to home page after successful login
    }
});
const doctors = [
    {
        doctor_id: 1,
        name: "Dr. John Doe",
        specialization: "Cardiologist",
        bio: "Experienced cardiologist with 10+ years of practice.",
        photo: "https://via.placeholder.com/150"
    },
    {
        doctor_id: 2,
        name: "Dr. Jane Smith",
        specialization: "Dermatologist",
        bio: "Specializes in skin care and cosmetic treatments.",
        photo: "https://via.placeholder.com/150"
    }
];

// Fetch and display doctors
async function loadDoctors() {
    try {
        const response = await fetch('/api/doctors'); // Replace with your API endpoint
        const doctors = await response.json();

        const doctorsList = document.getElementById('doctorsList');
        doctorsList.innerHTML = doctors.map(doctor => `
            <div class="col-md-4">
                <div class="card text-center p-4">
                    <img src="${doctor.photo}" alt="${doctor.name}" class="card-img-top">
                    <div class="card-body">
                        <h5 class="card-title">${doctor.name}</h5>
                        <p class="card-text text-muted">${doctor.specialization}</p>
                        <p class="card-text">${doctor.bio}</p>
                        <a href="/book-appointment?doctor_id=${doctor.doctor_id}" class="btn btn-primary">Book Appointment</a>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading doctors:', error);
    }
}

// Load doctors when the page loads
document.addEventListener('DOMContentLoaded', loadDoctors);