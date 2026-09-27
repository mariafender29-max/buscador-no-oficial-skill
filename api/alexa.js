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

    const respuesta = await buscarEnWikipedia(query);

    const speakOutput = respuesta
      ? `Según Wikipedia: ${respuesta} ¿Quieres buscar algo más?`
      : `No encontré información sobre ${query} en Wikipedia. ¿Quieres buscar algo más?`;

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
