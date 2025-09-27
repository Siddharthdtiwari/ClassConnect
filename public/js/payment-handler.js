document.addEventListener("DOMContentLoaded", () => {
  const payButton = document.getElementById("pay-button");

  if (!payButton) {
    return;
  }

  payButton.onclick = async function (e) {
    e.preventDefault();

    const key = payButton.dataset.key;
    const amount = payButton.dataset.amount;
    const studentName = payButton.dataset.name;
    const email = payButton.dataset.email;
    const contact = payButton.dataset.contact;

    const response = await fetch("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount,
      }),
    });

    if (!response.ok) {
      alert("Failed to create payment order. Please try again.");
      return;
    }

    const order = await response.json();

    const options = {
      key: key,
      amount: order.amount,
      currency: order.currency,
      name: "TUITION HUB Education Center",
      description: "Monthly Fee Payment",
      image: "/images/logo.png",
      order_id: order.id,

      handler: async function (response) {
        const verificationResponse = await fetch("/verify-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            amount: amount,
          }),
        });

        const result = await verificationResponse.json();

        if (result.status === "success") {
          alert("Payment successful!");
          window.location.href = "/student/dashboard";
        } else {
          alert("Payment verification failed. Please contact support.");
        }
      },
      prefill: {
        name: studentName,
        email: email,
        contact: contact,
      },
      notes: {
        address: "Student Address Here",
      },
      theme: {
        color: "#5d3a9b",
      },
    };

    const rzp = new Razorpay(options);
    rzp.open();

    rzp.on("payment.failed", function (response) {
      alert("Payment Failed: " + response.error.description);
      console.error("Payment Failed:", response.error);
    });
  };
});
