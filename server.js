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

    const monthIndex = new Date().getMonth()
    const monthNames = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december"
    ]
    let PaymentType = session.metadata.paying_for
    let weeklyOrder = session.metadata.weeklyOrder

    if (PaymentType == 'cart') {
      const userId = session.metadata.user_id;

      let userCart;
      if (weeklyOrder == 'cart') {
        userCart = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/cart/${userId}.json`)).data
      }
      else {
        userCart = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/weeklyorders/${userId}.json`)).data
      }


      const orderData = {
        items: userCart,
        total: session.amount_total / 100,
        status: 'Processing',
        createdAt: new Date().toISOString(),
        customerName: session.metadata.customer_name,
        customerEmail: session.customer_email,
        customerAddress: session.metadata.location,
        customerPhoneNumber: session.metadata.customerPhoneNumber,
      };

      try {
        let response = '';

        if (session.metadata.weeklyOrder == 'weekly') {
          response = await axios.post(`https://dailymart-5c550-default-rtdb.firebaseio.com/weeklyordersOrders/${userId}.json`, orderData);
          await axios.patch(`https://dailymart-5c550-default-rtdb.firebaseio.com/users/customer/${userId}.json`, { orderStatus: 'Pending' });
        }
        else {
          response = await axios.post(`https://dailymart-5c550-default-rtdb.firebaseio.com/orders/${userId}.json`, orderData);
          await axios.delete(`https://dailymart-5c550-default-rtdb.firebaseio.com/cart/${userId}.json`);
        }
        if (response.status === 200) {
          let oldSalesRevenue = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/profits/${monthNames[monthIndex]}/salesRevenue.json`)).data

          await axios.patch(`https://dailymart-5c550-default-rtdb.firebaseio.com/profits/${monthNames[monthIndex]}.json`, { salesRevenue: oldSalesRevenue + session.amount_total / 100 })

          let deliveryAddresses = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/users/customer/${userId}/deliveryAddresses.json`)).data
          let customerAddress = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/users/customer/${userId}/address.json`)).data.location

          if (customerAddress != session.metadata.location) {
            if (deliveryAddresses == null) {
              deliveryAddresses = []
            }

            deliveryAddresses.push(session.metadata.location)
            deliveryAddresses = [...new Set(deliveryAddresses)]

            await axios.patch(`https://dailymart-5c550-default-rtdb.firebaseio.com/users/customer/${userId}.json`, {
              deliveryAddresses: deliveryAddresses
            })
          }



          // a5od el cart mn el destruct bta3 el body w ab3to fi el meta data w a5do mn hnak
          // async function updateCartAvailability(cartAvailabitiy) {
          //   let updatePromises = cartAvailabitiy.map((item) => {
          //     return axios.patch(`https://dailymart-5c550-default-rtdb.firebaseio.com/products/${item}.json`, {
          //       availability: item
          //     })
          //       .then(res => {
          //         return res
          //       })
          //       .catch(err => {
          //         console.log(err);
          //       });
          //   });

          //   try {
          //     await Promise.all(updatePromises)
          //   }
          //   catch (err) {
          //     console.log(err);
          //   }
          // }
          // updateCartAvailability(cartAvailabitiy)


        }
        else {
          console.error('Failed to add order to Firebase');
        }
      } catch (error) {
        console.error('Error adding order to Firebase:', error);
      }
    }

    else {
      try {
        let oldSubscriptionsRevenue = (await axios.get(`https://dailymart-5c550-default-rtdb.firebaseio.com/profits/${monthNames[monthIndex]}/subscriptionsRevenue.json`)).data

        await axios.patch(`https://dailymart-5c550-default-rtdb.firebaseio.com/profits/${monthNames[monthIndex]}.json`, { subscriptionsRevenue: oldSubscriptionsRevenue + 250 })
      } catch (error) {
        console.error('Error Patching the subscritpion revenue:', error);
      }
    }
  }

  res.json({ received: true });
});

app.use(bodyParser.json());

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { cartArray, userName, userEmail, userId, subscribed, customerPhoneNumber, location, deliveryCharge, weeklyOrder } = req.body;

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


    if (subscribed == undefined) {
      line_items.push({
        price_data: {
          currency: 'egp',
          product_data: {
            name: 'Delivery Charge'
          },
          unit_amount: deliveryCharge * 100
        },
        quantity: 1
      });
    }

    // Create a new Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],

      line_items: line_items,
      mode: 'payment',
      success_url: 'https://amr-muhammad.github.io/dailymart/#/useraccount/myorders',
      cancel_url: 'http://localhost:8080/homePage',
      customer_email: userEmail,
      metadata: {
        customer_name: userName,
        user_id: userId,
        paying_for: "cart",
        customerPhoneNumber: customerPhoneNumber,
        location: location,
        weeklyOrder: weeklyOrder,
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
