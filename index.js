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

// 6-digit Indian Pincode check karne ka helper function
function extractPincode(text) {
  const match = text.match(/\b[1-9][0-9]{5}\b/);
  return match ? match[0] : null;
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const payload = req.body;

  if (payload.event !== 'message.received' || payload.direction !== 'inbound') {
    return;
  }

  const customerPhone = payload.from;
  const customerWaName = payload.contact?.name || 'Customer';
  const messageType = payload.message?.type;

  // 1. Jab customer catalog se "View Cart" bhejta hai
  if (messageType === 'order') {
    const items = payload.message.order?.product_items || [];
    
    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += (item.item_price * item.quantity);
    });

    userState[customerPhone] = {
      step: 'WAITING_FOR_ADDRESS',
      items: items,
      totalAmount: totalAmount,
      addressText: ''
    };

    const replyText = `Namaste *${customerWaName}*! 🙏\n\nAapka cart (Total: *₹${totalAmount}*) humein mil gaya hai. 🛒\n\nOrder confirm karne ke liye kripya apna:\n1. *Full Name*\n2. *Complete Delivery Address (with Pincode)*\n\nek hi message mein likh kar bhejein.`;

    await sendWhatsAppMessage(customerPhone, replyText);
  } 
  
  // 2. Jab customer Name aur Address bhejta hai
  else if (messageType === 'text' && userState[customerPhone]?.step === 'WAITING_FOR_ADDRESS') {
    const incomingText = typeof payload.message.text === 'string' 
      ? payload.message.text 
      : payload.message.text?.body || '';

    const pincode = extractPincode(incomingText);

    // Agar customer ne Pincode bhi saath mein bhej diya hai
    if (pincode) {
      console.log("=== NEW ORDER CONFIRMED ===");
      console.log({
        phone: customerPhone,
        whatsappName: customerWaName,
        items: userState[customerPhone].items,
        totalAmount: userState[customerPhone].totalAmount,
        deliveryDetails: incomingText,
        pincode: pincode
      });

      const confirmText = `Dhanyawad *${customerWaName}*! ✅\n\nAapka order aur delivery address (Pincode: *${pincode}*) note kar liya gaya hai. Hum jald hi aapka order dispatch karke tracking details bhejenge.`;
      await sendWhatsAppMessage(customerPhone, confirmText);

      delete userState[customerPhone];
    } 
    // Agar customer ne sirf Name aur Address bheja hai (Pincode nahi dala)
    else {
      userState[customerPhone].addressText = incomingText;
      userState[customerPhone].step = 'WAITING_FOR_PINCODE';

      const askPincodeText = `Agar aapne apna naam or address hume bhej diya hai to Order confirm karne ke liye kripya apna *6-digit Pincode* bhi bhejein. 📍`;
      await sendWhatsAppMessage(customerPhone, askPincodeText);
    }
  }

  // 3. Jab customer alag se Pincode bhejta hai
  else if (messageType === 'text' && userState[customerPhone]?.step === 'WAITING_FOR_PINCODE') {
    const incomingText = typeof payload.message.text === 'string' 
      ? payload.message.text 
      : payload.message.text?.body || '';

    const pincode = extractPincode(incomingText);

    if (pincode) {
      const fullAddress = `${userState[customerPhone].addressText} - Pincode: ${pincode}`;

      console.log("=== NEW ORDER CONFIRMED ===");
      console.log({
        phone: customerPhone,
        whatsappName: customerWaName,
        items: userState[customerPhone].items,
        totalAmount: userState[customerPhone].totalAmount,
        deliveryDetails: fullAddress,
        pincode: pincode
      });

      const confirmText = `Dhanyawad *${customerWaName}*! ✅\n\nAapka order aur delivery address (Pincode: *${pincode}*) note kar liya gaya hai. Humari team jald hi order ki delivery ke liye aapse sampark karegi.`;
      await sendWhatsAppMessage(customerPhone, confirmText);

      delete userState[customerPhone];
    } else {
      // Agar customer ne galat pincode (jaise 4 digit ya text) bhej diya
      const retryPincodeText = `Kripya sahi *6-digit Pincode* (jaise 452001) likh kar bhejein taaki hum aapka order confirm kar sakein.`;
      await sendWhatsAppMessage(customerPhone, retryPincodeText);
    }
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
