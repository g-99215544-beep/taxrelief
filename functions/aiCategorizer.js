const { Configuration, OpenAI } = require('openai');

const TAX_CATEGORIES = {
  MEDICAL: { name: 'Medical', limit: 8000, keywords: ['clinic', 'hospital', 'pharmacy', 'doctor', 'medicine'] },
  EDUCATION: { name: 'Education', limit: 7000, keywords: ['university', 'college', 'school', 'course', 'tuition'] },
  LIFESTYLE: { name: 'Lifestyle', limit: 2500, keywords: ['gym', 'fitness', 'sports equipment'] },
  BOOKS: { name: 'Books', limit: 2500, keywords: ['bookstore', 'books', 'magazine', 'journal'] },
  SPORTS: { name: 'Sports', limit: 500, keywords: ['sports', 'equipment', 'gear'] },
  GADGET: { name: 'Gadget', limit: 2500, keywords: ['computer', 'laptop', 'smartphone', 'tablet'] },
  INTERNET: { name: 'Internet', limit: 2500, keywords: ['broadband', 'internet', 'wifi', 'telco'] },
  PARENTING: { name: 'Parenting', limit: 2000, keywords: ['childcare', 'nursery', 'daycare', 'baby'] },
  INSURANCE: { name: 'Insurance', limit: 3000, keywords: ['insurance', 'premium', 'policy'] },
  PRS: { name: 'PRS', limit: 3000, keywords: ['prs', 'retirement', 'pension'] },
  OTHERS: { name: 'Others', limit: 0, keywords: [] }
};

async function categorizeReceipt({ merchant, items, amount, fullText }) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
      return useFallbackCategorization({ merchant, items, fullText });
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    const itemsList = items.map(item => item.name).join(', ');
    const prompt = `You are an AI tax assistant for Malaysia tax relief categorization.

Merchant: ${merchant}
Items: ${itemsList}
Amount: RM ${amount}
Full Receipt Text: ${fullText.substring(0, 500)}

Categorize this receipt into ONE of these Malaysia tax relief categories:
- Medical (hospitals, clinics, medicine)
- Education (schools, courses, tuition)
- Lifestyle (gym, fitness)
- Books (books, journals, magazines)
- Sports (sports equipment)
- Gadget (computers, smartphones, tablets)
- Internet (broadband, wifi)
- Parenting (childcare, nursery)
- Insurance (insurance premiums)
- PRS (retirement schemes)
- Others (non-eligible)

Respond in JSON format:
{
  "category": "category_name",
  "confidence": 0.95,
  "taxEligible": true,
  "reasoning": "brief explanation"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a Malaysia tax categorization expert. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const responseText = completion.choices[0].message.content.trim();
    const result = JSON.parse(responseText);

    return {
      category: result.category,
      confidence: result.confidence,
      taxEligible: result.taxEligible,
      reasoning: result.reasoning
    };

  } catch (error) {
    console.error('AI categorization error:', error);
    return useFallbackCategorization({ merchant, items, fullText });
  }
}

function useFallbackCategorization({ merchant, items, fullText }) {
  const text = `${merchant} ${items.map(i => i.name).join(' ')} ${fullText}`.toLowerCase();
  
  let bestMatch = { category: 'Others', score: 0 };
  
  for (const [key, catData] of Object.entries(TAX_CATEGORIES)) {
    let score = 0;
    for (const keyword of catData.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    
    if (score > bestMatch.score) {
      bestMatch = { category: catData.name, score };
    }
  }
  
  const confidence = bestMatch.score > 0 ? Math.min(0.6 + (bestMatch.score * 0.1), 0.9) : 0.3;
  const taxEligible = bestMatch.category !== 'Others';
  
  return {
    category: bestMatch.category,
    confidence,
    taxEligible,
    reasoning: 'Categorized using keyword matching'
  };
}

module.exports = { categorizeReceipt };
