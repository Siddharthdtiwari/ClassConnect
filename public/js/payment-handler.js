document.addEventListener("DOMContentLoaded", () => {
  const payButton = document.getElementById("pay-button");

  if (!payButton) {
    return;
  }

  const originalLabel = payButton.textContent.trim();

  function enableButton() {
    payButton.disabled = false;
    payButton.textContent = originalLabel;
  }

  payButton.onclick = async function (e) {
    e.preventDefault();

    payButton.disabled = true;
    payButton.textContent = "Processing...";

    const key = payButton.dataset.key;
    const amount = payButton.dataset.amount;
    const studentName = payButton.dataset.name;
    const email = payButton.dataset.email;
    const contact = payButton.dataset.contact;

    try {
      const response = await fetch("/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (!response.ok) {
        alert("Failed to create payment order. Please try again.");
        enableButton();
        return;
      }

      const order = await response.json();

      const options = {
        key,
        amount: order.amount,
        currency: order.currency,
        name: "TUITION HUB Education Center",
        description: "Monthly Fee Payment",
        image: "/images/logo.png",
        order_id: order.id,

        handler: async function (response) {
          try {
            const verificationResponse = await fetch("/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amount,
              }),
            });

            const result = await verificationResponse.json();

            if (result.status === "success") {
              alert("Payment successful!");
              window.location.href = "/student/dashboard";
            } else {
              alert("Payment verification failed. Please contact support.");
              enableButton();
            }
          } catch (err) {
            console.error("Verification error:", err);
            alert("Network error during verification. Please contact support.");
            enableButton();
          }
        },

        prefill: { name: studentName, email, contact },
        notes: {},
        theme: { color: "#5d3a9b" },

        modal: {
          ondismiss: enableButton,
        },
      };

      const rzp = new Razorpay(options);
      rzp.open();

      rzp.on("payment.failed", function (response) {
        alert("Payment Failed: " + response.error.description);
        console.error("Payment Failed:", response.error);
        enableButton();
      });

    } catch (err) {
      console.error("Order creation error:", err);
      alert("Something went wrong. Please try again.");
      enableButton();
    }
  };
});