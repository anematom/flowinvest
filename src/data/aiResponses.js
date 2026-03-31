// AI Assistant pre-built responses
// Matches user intent and returns calm, friendly advice

const responses = [
  {
    keywords: ['daal', 'omlaag', 'verlies', 'minder', 'geld kwijt', 'down', 'verloren', 'zakt', 'daalt', 'rood'],
    answer: 'Markten gaan op en neer — dat is heel normaal. Op de lange termijn herstellen ze zich vrijwel altijd. Het beste wat je kunt doen is rustig blijven en je plan volgen.',
  },
  {
    keywords: ['stoppen', 'stop', 'eruit', 'verkopen', 'ophalen', 'terugtrekken', 'opnemen', 'weg'],
    answer: 'Veel mensen verkopen tijdens een dip en missen daardoor het herstel. Historisch gezien presteert "blijven zitten" bijna altijd beter dan uitstappen. Neem geen beslissing vanuit paniek.',
  },
  {
    keywords: ['risico', 'gevaarlijk', 'veilig', 'verliezen', 'kwijtraken', 'bang'],
    answer: 'Je portfolio is samengesteld op basis van jouw risicoprofiel. Dat betekent dat de spreiding past bij wat je aankunt. Korte-termijn schommelingen zijn normaal en geen reden tot zorg.',
  },
  {
    keywords: ['hoe werkt', 'uitleg', 'wat gebeurt', 'snap', 'begrijp', 'wat is'],
    answer: 'Je geld wordt automatisch gespreid over verschillende beleggingen. Denk aan een mix van aandelen en obligaties. Hoe meer spreiding, hoe stabieler — maar op de lange termijn groeien ze allemaal.',
  },
  {
    keywords: ['meer', 'bijstorten', 'extra', 'verhogen', 'meer investeren', 'inleggen'],
    answer: 'Meer inleggen is een goede manier om je vermogen sneller te laten groeien. Vooral regelmatig een vast bedrag inleggen werkt goed — dat heet "dollar cost averaging" en beschermt je tegen slechte timing.',
  },
  {
    keywords: ['wanneer', 'hoe lang', 'hoelang', 'duur', 'tijd', 'geduld'],
    answer: 'Beleggen is een marathon, geen sprint. De meeste beleggers zien de beste resultaten na 5+ jaar. Geduld is je grootste vriend bij het opbouwen van vermogen.',
  },
  {
    keywords: ['goed', 'winst', 'omhoog', 'stijg', 'positief', 'groen', 'groei'],
    answer: 'Mooi! Je portfolio groeit. Onthoud dat dit niet elke dag zo zal zijn — maar op de lange termijn is de trend positief. Blijf gewoon je plan volgen.',
  },
  {
    keywords: ['inflatie', 'sparen', 'spaarrekening', 'bank', 'rente'],
    answer: 'Op een spaarrekening verlies je door inflatie langzaam koopkracht. Beleggen biedt historisch gezien een hoger rendement dan sparen, mits je een lange horizon hebt.',
  },
  {
    keywords: ['belasting', 'tax', 'belastingen', 'fiscaal'],
    answer: 'In Nederland betaal je vermogensbelasting in box 3 boven een bepaalde vrijstelling. Het is slim om hier rekening mee te houden, maar laat belastingen je niet weerhouden van beleggen.',
  },
  {
    keywords: ['crash', 'crisis', 'recessie', 'oorlog', 'pandemie'],
    answer: 'Grote marktdalingen zijn zeldzaam maar komen voor. Na elke crisis in de geschiedenis zijn de markten uiteindelijk hersteld en verder gegroeid. De sleutel is: niet verkopen tijdens paniek.',
  },
];

const defaultResponse = 'Ik begrijp je vraag. Bij FlowInvest draait alles om rust en lange-termijn groei. Probeer niet te veel naar dagelijkse schommelingen te kijken — focus op je doel. Heb je een specifieke vraag over je portfolio?';

export function getAIResponse(userMessage) {
  const message = userMessage.toLowerCase();

  for (const item of responses) {
    if (item.keywords.some(keyword => message.includes(keyword))) {
      return item.answer;
    }
  }

  return defaultResponse;
}

export const suggestedQuestions = [
  'Waarom daalt mijn geld?',
  'Moet ik stoppen?',
  'Hoe werkt beleggen?',
  'Hoe lang moet ik wachten?',
];
