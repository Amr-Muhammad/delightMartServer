const express = require('express');
const stripe = require('stripe')('sk_test_51PtX5uLbeudqBLeNEAc5erBrRhOADLqzmk0AeUYntUFjcXhhuwtszfstPJl9yr44yFbeYsNTcwJP1JbxseuHRgzG00hGNa0eJM');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.post('/create-checkout-session', async (req, res) => {
  try {
    console.log(req);

    const { cartArray, userName, userEmail } = req.body;

    // Create a new Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: cartArray.map(product => ({
        price_data: {
          currency: 'egp',
          product_data: {
            name: product.english_name
          },
          unit_amount: product.price  // Price in cents
        },
        quantity: 1
      })),
      mode: 'payment',
      success_url: 'http://localhost:8080/success',
      cancel_url: 'http://localhost:8080/cancel',
      customer_email: userEmail, // Pass customer's email to pre-fill email field
      metadata: {
        customer_name: userName // Store customer's name as metadata
      }
    });

    // Send the session ID to the frontend
    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
