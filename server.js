const express = require('express');
const stripe = require('stripe')('sk_test_51PtX5uLbeudqBLeNEAc5erBrRhOADLqzmk0AeUYntUFjcXhhuwtszfstPJl9yr44yFbeYsNTcwJP1JbxseuHRgzG00hGNa0eJM');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());


app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, 'whsec_cF8esG8EhA9L8nDRboCcZalbExcSsAhy');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const retrievedSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items']
    });

    const userId = session.metadata.user_id;

    let userCart = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/cart/${userId}.json`)).data

    const orderData = {
      items: userCart,
      total: session.amount_total / 100,
      status: 'Processing',
      createdAt: new Date().toISOString(),
      customerName: session.metadata.customer_name,
      customerEmail: session.customer_email
    };

    try {
      // Add the order to Firebase under the user's orders
      const response = await axios.post(`https://dailymart-5c550-default-rtdb.firebaseio.com/orders/${userId}.json`, orderData);
      if (response.status === 200) {
        console.log('Order added successfully to Firebase');
        await axios.delete(`https://dailymart-5c550-default-rtdb.firebaseio.com/cart/${userId}.json`);
      } else {
        console.error('Failed to add order to Firebase');
      }
    } catch (error) {
      console.error('Error adding order to Firebase:', error);
    }
  }

  res.json({ received: true });
});

app.use(bodyParser.json());

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { cartArray, userName, userEmail, userId, subscribed } = req.body;

    let line_items = cartArray.map(product => ({
      price_data: {
        currency: 'egp',
        product_data: {
          name: product.english_name,
          images: [product.image_url],
          description: product.description
        },
        unit_amount: product.price * 100
      },
      quantity: product.quantity,

    }))

    if (!subscribed) {
      line_items.push({
        price_data: {
          currency: 'egp',
          product_data: {
            name: 'Delivery Fee'
          },
          unit_amount: 5000
        },
        quantity: 1
      });
    }

    // Create a new Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],

      line_items: line_items,
      mode: 'payment',
      success_url: 'http://localhost:8080/useraccount/myorders',
      cancel_url: 'http://localhost:8080/homePage',
      customer_email: userEmail,
      metadata: {
        customer_name: userName,
        user_id: userId,
        // cart: JSON.stringify(cartArray)
      }
    });


    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
