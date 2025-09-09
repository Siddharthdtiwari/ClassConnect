const mongoose = require('mongoose');


const feeSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true
    },

    studentName: { type: String, required: true },  // duplicate for easy display
    standard: { type: String, required: true },

    month: { type: String, required: true },   // e.g. "Jun"
    year: { type: Number, required: true },    // e.g. 2025

    amount: { type: Number, required: true },

    method: { type: String, enum: ["Cash", "UPI", "Razorpay"], required: true },

    status: { type: String, enum: ["Paid", "Failed"], default: "Paid" },

    // only needed if Razorpay
    razorpay_payment_id: { type: String },

    datePaid: { type: Date, default: Date.now }
}, { timestamps: true });


module.exports = mongoose.model('Fee', feeSchema);
