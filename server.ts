import express from 'express';

const app = express();
const PORT = 3000;

// --- MIKU'S FUZZY LOGIC ENGINE ---
function getFuzzyAngle(flow) {
  // 1. Fuzzification (Membership Functions)
  // We determine "how much" the flow belongs to each category (0.0 to 1.0)
  
  // Low Flow: Peaks at 1.0 L/min, drops to 0 at 3.5 L/min
  const uLow = Math.max(0, 1 - (flow - 1.0) / 2.5);
  
  // Medium Flow: Peaks at 3.5 L/min, drops to 0 at 1.0 and 6.0
  const uMed = Math.max(0, 1 - Math.abs(flow - 3.5) / 2.5);
  
  // High Flow: Peaks at 6.0 L/min, drops to 0 at 3.5 L/min
  const uHigh = Math.max(0, 1 - (6.0 - flow) / 2.5);

  // 2. Rule Evaluation (Target Angles for each state)
  const angleLow = 10;  // If flow is purely Low, aim for 10°
  const angleMed = 40;  // If flow is purely Med, aim for 40°
  const angleHigh = 75; // If flow is purely High, aim for 75° (Highest allowed!)

  // 3. Defuzzification (Weighted Average)
  // We blend the rules together based on how true each state is!
  const numerator = (uLow * angleLow) + (uMed * angleMed) + (uHigh * angleHigh);
  const denominator = uLow + uMed + uHigh;

  if (denominator === 0) return 0;

  let finalAngle = Math.round(numerator / denominator);
  
  // Hard limit to ensure it never exceeds 75 degrees just in case
  return Math.min(75, finalAngle);
}

// --- EXPRESS SERVER ---
app.get('/a/:waterAmount', (req, res) => {
  const waterAmount = parseFloat(req.params.waterAmount);

  if (isNaN(waterAmount)) {
    return res.status(400).send('Invalid water amount');
  }

  // CONSTRAINT: Do not accept lower than 1 L/min
  if (waterAmount < 1.0) {
    console.log(`[RECEIVE] Flow Rate: ${waterAmount} L/min (REJECTED: Under 1 L/min)`);
    // Sending back '0' to safely tell the ESP32 to default/shut down the angle
    return res.send('0'); 
  }

  // Cap the math logic at 6.0 so the fuzzy logic doesn't break on extreme surges
  const safeFlow = Math.min(waterAmount, 6.0);
  
  // Calculate the AI angle
  const bladeAngle = getFuzzyAngle(safeFlow);

  console.log(`[RECEIVE] Flow Rate: ${waterAmount} L/min -> Fuzzy Angle: ${bladeAngle}°`);

  res.send(`${bladeAngle}`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`miku dayo~~~ http://localhost:${PORT}`);
});
