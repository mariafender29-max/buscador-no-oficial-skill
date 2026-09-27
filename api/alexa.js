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

const SearchIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'SearchIntent'
    );
  },
  handle(handlerInput) {
    const query = Alexa.getSlotValue(handlerInput.requestEnvelope, 'search');

    // TODO: aquí es donde, más adelante, se puede llamar a una API real de
    // búsqueda (Bing, SerpAPI, etc.) y leer un resumen del resultado.
    const speakOutput = query
      ? `Buscaste: ${query}. Todavía no tengo una fuente de búsqueda conectada, pero tu skill ya está funcionando de punta a punta. ¿Quieres buscar algo más?`
      : 'No entendí qué querías buscar. ¿Puedes repetirlo?';

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
