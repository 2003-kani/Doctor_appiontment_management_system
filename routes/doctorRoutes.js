const express = require('express');
const { createDoctor, getDoctors } = require('../controllers/doctorController');

const router = express.Router();

router.post('/doctors', createDoctor);
router.get('/doctors', getDoctors);

module.exports = router;