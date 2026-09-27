const Alexa = require('ask-sdk-core');
const { ExpressAdapter } = require('ask-sdk-express-adapter');
const express = require('express');

// --- Handlers ---

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speakOutput = '¿Qué quieres saber?';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

// Busca un artículo en Wikipedia en español y devuelve un resumen corto,
// apto para ser leído en voz alta. Devuelve null si no encuentra nada.
async function buscarEnWikipedia(query) {
  try {
    const searchUrl =
      'https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=' +
      encodeURIComponent(query);

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();

    const primerResultado = searchData && searchData.query && searchData.query.search && searchData.query.search[0];
    if (!primerResultado) return null;

    const titulo = primerResultado.title;
    const summaryUrl = 'https://es.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titulo);

    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();

    let extracto = summaryData && summaryData.extract;
    if (!extracto) return null;

    // Alexa lee mejor respuestas cortas: recortamos a ~400 caracteres
    // en el límite de una oración para que no se corte a mitad de palabra.
    if (extracto.length > 400) {
      const recorte = extracto.slice(0, 400);
      const ultimoPunto = recorte.lastIndexOf('.');
      extracto = ultimoPunto > 100 ? recorte.slice(0, ultimoPunto + 1) : recorte + '...';
    }

    return extracto;
  } catch (error) {
    console.log('Error buscando en Wikipedia: ' + error.message);
    return null;
  }
}

// Le pregunta a Google Gemini directamente (más "inteligente" que un resumen
// de Wikipedia: puede razonar, resumir y responder casi cualquier pregunta).
// Requiere la variable de entorno GEMINI_API_KEY (gratis, sin tarjeta, desde
// https://aistudio.google.com/apikey). Devuelve null si algo falla, para que
// el llamador pueda recurrir a Wikipedia como respaldo.
async function preguntarAGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const modelo = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Responde en español, de forma breve (máximo 2 o 3 frases cortas), ' +
                  'clara y natural para ser leída en voz alta por un altavoz inteligente. ' +
                  'No uses listas, markdown, emojis ni texto entre paréntesis. ' +
                  'Pregunta: ' +
                  query,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 200,
          temperature: 0.4,
        },
      }),
    });

    if (!res.ok) {
      const textoError = await res.text().catch(() => '');
      console.log('Gemini respondió con error HTTP ' + res.status + ' (modelo: ' + modelo + '): ' + textoError.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const texto =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!texto) return null;

    // Alexa no debe leer markdown (asteriscos, numerales, etc.) ni respuestas larguísimas.
    let limpio = texto.replace(/[*_#`]/g, '').trim();
    if (limpio.length > 500) {
      const recorte = limpio.slice(0, 500);
      const ultimoPunto = recorte.lastIndexOf('.');
      limpio = ultimoPunto > 100 ? recorte.slice(0, ultimoPunto + 1) : recorte + '...';
    }

    return limpio;
  } catch (error) {
    console.log('Error llamando a Gemini: ' + error.message);
    return null;
  }
}

const SearchIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'SearchIntent'
    );
  },
  async handle(handlerInput) {
    const query = Alexa.getSlotValue(handlerInput.requestEnvelope, 'search');

    if (!query) {
      return handlerInput.responseBuilder
        .speak('No entendí qué querías buscar. ¿Puedes repetirlo?')
        .reprompt('¿Qué quieres buscar?')
        .getResponse();
    }

    // 1) Intentamos con Gemini (respuestas más inteligentes y naturales).
    // 2) Si no hay API key configurada o Gemini falla, caemos a Wikipedia.
    let speakOutput;
    const respuestaGemini = await preguntarAGemini(query);

    if (respuestaGemini) {
      speakOutput = `${respuestaGemini} ¿Quieres preguntar algo más?`;
    } else {
      const respuestaWikipedia = await buscarEnWikipedia(query);
      speakOutput = respuestaWikipedia
        ? `Según Wikipedia: ${respuestaWikipedia} ¿Quieres buscar algo más?`
        : `No encontré información sobre ${query}. ¿Quieres buscar algo más?`;
    }

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('¿Qué más quieres saber?')
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput = 'Puedes preguntarme algo, por ejemplo: busca quién inventó la guitarra eléctrica.';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    const intentName = requestType === 'IntentRequest' ? Alexa.getIntentName(handlerInput.requestEnvelope) : null;
    return intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('¡Hasta luego!').getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error: ${error.message}`);
    const speakOutput = 'Lo siento, tuve un problema. Inténtalo de nuevo.';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

// --- Skill setup ---

const skillBuilder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    SearchIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler);

const skill = skillBuilder.create();
const adapter = new ExpressAdapter(skill, true, true); // verifica firma y timestamp

const app = express();
app.post('/api/alexa', adapter.getRequestHandlers());

module.exports = app;
