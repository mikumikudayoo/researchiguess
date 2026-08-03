import express from 'express';

const app = express();
const PORT = 3000;

// GET Endpoint matching your plan: GET /a/<waterAmount>
app.get('/a/:waterAmount', (req, res) => {
  const waterAmount = parseFloat(req.params.waterAmount);
  
  if (isNaN(waterAmount)) {
    return res.status(400).send('Invalid water amount');
  }

  // --- FUZZY LOGIC CALCULATION (Example rules) ---
  // Calculates ideal blade angle (0 to 180 degrees) based on water amount
  let bladeAngle = 0;
  if (waterAmount <= 30) {
    bladeAngle = Math.round((waterAmount / 30) * 45); // Closed/Low Flow
  } else if (waterAmount <= 70) {
    bladeAngle = Math.round(45 + ((waterAmount - 30) / 40) * 45); // Medium Flow
  } else {
    bladeAngle = Math.round(90 + (Math.min(waterAmount - 70, 30) / 30) * 90); // High Flow
  }

  console.log(`[RECEIVE] Water Amount: ${waterAmount} L/min ➔ Calculated Blade Angle: ${bladeAngle}°`);

  // Respond back to the ESP32 with the calculated angle
  res.send(`${bladeAngle}`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`miku dayo~~~ http://localhost:${PORT} !!!`);
});