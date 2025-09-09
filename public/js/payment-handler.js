document.addEventListener('DOMContentLoaded', () => {
    // Select the pay button only if it exists on the page
    const payButton = document.getElementById('pay-button');

    // If the pay button isn't on the page (e.g., no amount is due), do nothing.
    if (!payButton) {
        return;
    }

    // Add a click event listener to the button
    payButton.onclick = async function (e) {
        e.preventDefault();

        // 1. Get all the payment data from the button's data-* attributes
        const key = payButton.dataset.key;
        const amount = payButton.dataset.amount;
        const studentName = payButton.dataset.name;
        const email = payButton.dataset.email;
        const contact = payButton.dataset.contact;

        // 2. Create a payment order on your server
        // We send the amount to the backend to create an order for that specific amount
        const response = await fetch('/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amount,
            }),
        });

        if (!response.ok) {
            alert('Failed to create payment order. Please try again.');
            return;
        }

        const order = await response.json();

        // 3. Set up the Razorpay checkout options
        const options = {
            key: key, // Your Razorpay Key ID
            amount: order.amount, // Amount in paise (from the server)
            currency: order.currency,
            name: 'Tuition Hub', // Your business name
            description: 'Monthly Fee Payment',
            image: '/images/logo.png', // URL of your logo
            order_id: order.id, // The order_id obtained from your server
            
            // This handler function is called after a successful payment
            handler: async function (response) {
                // 4. Send the payment details to your server for verification
                const verificationResponse = await fetch('/verify-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                        amount: amount // Pass the amount to be saved in the DB
                    }),
                });

                const result = await verificationResponse.json();

                if (result.status === 'success') {
                    alert('Payment successful!');
                    // Redirect the student to their dashboard after successful payment
                    window.location.href = '/student/dashboard';
                } else {
                    alert('Payment verification failed. Please contact support.');
                }
            },
            prefill: {
                name: studentName,
                email: email,
                contact: contact,
            },
            notes: {
                address: 'Student Address Here',
            },
            theme: {
                color: '#5d3a9b', // Corresponds to your brand's purple color
            },
        };

        // 5. Create a new Razorpay instance and open the checkout modal
        const rzp = new Razorpay(options);
        rzp.open();

        // Handle payment failure
        rzp.on('payment.failed', function (response) {
            alert('Payment Failed: ' + response.error.description);
            console.error('Payment Failed:', response.error);
        });
    };
});