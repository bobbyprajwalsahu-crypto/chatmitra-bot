const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Apni ChatMitra API details yahan daalein
const CHATMITRA_API_URL = 'https://backend.chatmitra.com/developer/api/send_message';
const API_TOKEN = '107b1d273e4ca8d4ff222dae7129df56:2855333b8497f40b8e35a5e961a8d0e56ecd59459a391cbc510c387f9868b0d93f7bd09c7827328bdd30c09049528219b0defdfc42e1854c495cfb5cc6f17a426e407d1982eddf76ecd67f044b99f702e3b279491b77fa59f911eaa4b10869b9c8627b523bdbe086a35e0f0117d2b3b6288a1879f5f2dc4ad3148db94c03e3f4c57323073d96f3d1d6762b5cc483a1f2af3b08f9f68559878b4528d0304187c0f4b74da1168263d5ec87208c3257eb7516fbbdda5385391b17e84406a87da2c3'; 

// Customer ka order state yaad rakhne ke liye temporary storage
const userState = {}; 

// Browser mein URL kholne par status dikhane ke liye
app.get('/', (req, res) => {
  res.send('ChatMitra Webhook Server is Running!');
});

app.post('/webhook', async (req, res) => {
  // ChatMitra ko turant 200 OK response bhejein
  res.sendStatus(200);

  const payload = req.body;

  // Sirf inbound (customer ke bheje hue) messages ko process karein
  if (payload.event !== 'message.received' || payload.direction !== 'inbound') {
    return;
  }

  const customerPhone = payload.from;
  const customerWaName = payload.contact?.name || 'Customer';
  const messageType = payload.message?.type;

  // 1. Jab customer catalog se "View Cart" bhejta hai
  if (messageType === 'order') {
    const items = payload.message.order?.product_items || [];
    
    // Total amount calculate karein
    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += (item.item_price * item.quantity);
    });

    // State save karein ki ab hum is customer se address mang rahe hain
    userState[customerPhone] = {
      step: 'WAITING_FOR_ADDRESS',
      items: items,
      totalAmount: totalAmount
    };

    const replyText = `Namaste *${customerWaName}*! 🙏\n\nAapka cart (Total: *₹${totalAmount}*) humein mil gaya hai. 🛒\n\nOrder confirm karne ke liye kripya apna:\n1. *Full Name*\n2. *Complete Delivery Address (with Pincode)*\n3. *Alternate Mobile Number*\n\nek hi message mein likh kar bhejein.`;

    await sendWhatsAppMessage(customerPhone, replyText);
  } 
  
  // 2. Jab customer apna Name aur Address reply karta hai
  else if (messageType === 'text' && userState[customerPhone]?.step === 'WAITING_FOR_ADDRESS') {
    const customerAddressDetails = typeof payload.message.text === 'string' 
      ? payload.message.text 
      : payload.message.text?.body;

    // Confirmed order logs mein print karein
    console.log("=== NEW ORDER CONFIRMED ===");
    console.log({
      phone: customerPhone,
      whatsappName: customerWaName,
      items: userState[customerPhone].items,
      totalAmount: userState[customerPhone].totalAmount,
      deliveryDetails: customerAddressDetails
    });

    // Confirmation message bhejein
    const confirmText = `Dhanyawad *${customerWaName}*! ✅\n\nAapka order aur delivery address note kar liya gaya hai. Hum jald hi aapka order dispatch karke tracking details bhejenge.`;
    await sendWhatsAppMessage(customerPhone, confirmText);

    // State clear kar dein
    delete userState[customerPhone];
  }
});

// ChatMitra API se message bhejne ka exact function
async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(
      CHATMITRA_API_URL,
      {
        recipient_mobile_number: String(to),
        messages: [
          {
            kind: 'raw',
            payload: {
              type: 'text',
              text: {
                body: text
              }
            }
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`Auto-reply sent to ${to}`);
  } catch (error) {
    console.error("Message bhejne mein error:", error.response?.data || error.message);
  }
}
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server running on port ${PORT}`);
});
