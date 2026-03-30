type Schema = Record<string, unknown>;

interface EndpointSchema {
  requestBody: Schema;
  response?: Schema;
}

function obj(
  properties: Record<string, Schema>,
  required?: string[],
): Schema {
  return {
    type: 'object',
    properties,
    ...(required ? { required } : {}),
  };
}

function str(desc: string, extra?: Record<string, unknown>): Schema {
  return { type: 'string', description: desc, ...extra };
}

function num(desc: string): Schema {
  return { type: 'number', description: desc };
}

function bool(desc: string): Schema {
  return { type: 'boolean', description: desc };
}

function arr(items: Schema, desc: string): Schema {
  return { type: 'array', items, description: desc };
}

// --- Reusable schema templates ---

const chatCompletionsRequest = obj({
  model: str('Model name (e.g. gpt-4o, llama-3.3-70b)'),
  messages: arr(
    obj({
      role: str('Message role', { enum: ['system', 'user', 'assistant'] }),
      content: str('Message content'),
    }, ['role', 'content']),
    'Conversation messages',
  ),
  temperature: num('Sampling temperature (0-2)'),
  max_tokens: num('Maximum tokens to generate'),
  stream: bool('Stream response tokens'),
}, ['messages']);

const embeddingsRequest = obj({
  model: str('Embedding model name'),
  input: str('Text to embed (or array of strings)'),
}, ['input']);

const searchQueryRequest = obj({
  q: str('Search query'),
}, ['q']);

const imageGenRequest = obj({
  prompt: str('Text description of the image to generate'),
  image_size: str('Output size (e.g. landscape_4_3, square_hd)'),
  num_images: num('Number of images to generate'),
}, ['prompt']);

const urlRequest = obj({
  url: str('URL to process'),
}, ['url']);

// --- Per-endpoint schema map ---
// Key format: "{serviceId}/{endpointPath}" matching services.ts

const schemas: Record<string, EndpointSchema> = {
  // OpenAI
  'openai:/v1/chat/completions': { requestBody: chatCompletionsRequest },
  'openai:/v1/embeddings': { requestBody: embeddingsRequest },
  'openai:/v1/images/generations': {
    requestBody: obj({
      model: str('Model (dall-e-3, dall-e-2)'),
      prompt: str('Image description'),
      size: str('Image size (1024x1024, 1024x1792, 1792x1024)'),
      n: num('Number of images'),
    }, ['prompt']),
  },
  'openai:/v1/audio/transcriptions': {
    requestBody: obj({
      file: str('Audio file URL or base64'),
      model: str('Model (whisper-1)'),
      language: str('ISO-639-1 language code'),
    }, ['file']),
  },
  'openai:/v1/audio/speech': {
    requestBody: obj({
      model: str('TTS model (tts-1, tts-1-hd)'),
      input: str('Text to convert to speech'),
      voice: str('Voice (alloy, echo, fable, onyx, nova, shimmer)'),
    }, ['input', 'voice']),
  },

  // Anthropic
  'anthropic:/v1/messages': {
    requestBody: obj({
      model: str('Model (claude-sonnet-4-20250514, claude-opus-4-20250514, claude-3.5-haiku)'),
      messages: arr(
        obj({
          role: str('Role', { enum: ['user', 'assistant'] }),
          content: str('Message content'),
        }, ['role', 'content']),
        'Conversation messages',
      ),
      max_tokens: num('Maximum tokens to generate'),
      system: str('System prompt'),
    }, ['model', 'messages', 'max_tokens']),
  },

  // Fal
  'fal:/fal-ai/flux/dev': { requestBody: imageGenRequest },
  'fal:/fal-ai/flux-pro': { requestBody: imageGenRequest },
  'fal:/fal-ai/flux-realism': { requestBody: imageGenRequest },
  'fal:/fal-ai/recraft-20b': { requestBody: imageGenRequest },
  'fal:/fal-ai/whisper': {
    requestBody: obj({
      audio_url: str('URL of the audio file to transcribe'),
    }, ['audio_url']),
  },

  // Firecrawl
  'firecrawl:/v1/scrape': { requestBody: urlRequest },
  'firecrawl:/v1/crawl': { requestBody: urlRequest },
  'firecrawl:/v1/map': { requestBody: urlRequest },
  'firecrawl:/v1/extract': {
    requestBody: obj({
      url: str('URL to extract from'),
      schema: obj({}, undefined),
    }, ['url']),
  },

  // Gemini
  'gemini:/v1beta/models/gemini-2.5-flash': {
    requestBody: obj({
      contents: arr(
        obj({
          role: str('Role (user or model)'),
          parts: arr(obj({ text: str('Text content') }, ['text']), 'Content parts'),
        }, ['parts']),
        'Conversation contents',
      ),
    }, ['contents']),
  },
  'gemini:/v1beta/models/gemini-2.5-pro': {
    requestBody: obj({
      contents: arr(
        obj({
          role: str('Role (user or model)'),
          parts: arr(obj({ text: str('Text content') }, ['text']), 'Content parts'),
        }, ['parts']),
        'Conversation contents',
      ),
    }, ['contents']),
  },
  'gemini:/v1beta/models/embedding-001': {
    requestBody: obj({
      content: obj({ parts: arr(obj({ text: str('Text to embed') }, ['text']), 'Parts') }, ['parts']),
    }, ['content']),
  },

  // Groq
  'groq:/v1/chat/completions': { requestBody: chatCompletionsRequest },
  'groq:/v1/audio/transcriptions': {
    requestBody: obj({
      file: str('Audio file URL or base64'),
      model: str('Model (whisper-large-v3)'),
      language: str('ISO-639-1 language code'),
    }, ['file']),
  },

  // Perplexity
  'perplexity:/v1/chat/completions': { requestBody: chatCompletionsRequest },

  // Brave
  'brave:/v1/web/search': { requestBody: searchQueryRequest },
  'brave:/v1/images/search': { requestBody: searchQueryRequest },
  'brave:/v1/news/search': { requestBody: searchQueryRequest },
  'brave:/v1/videos/search': { requestBody: searchQueryRequest },
  'brave:/v1/summarizer/search': { requestBody: searchQueryRequest },

  // DeepSeek
  'deepseek:/v1/chat/completions': { requestBody: chatCompletionsRequest },

  // Resend
  'resend:/v1/emails': {
    requestBody: obj({
      from: str('Sender email address'),
      to: str('Recipient email (or array)'),
      subject: str('Email subject'),
      html: str('HTML body'),
      text: str('Plain text body'),
    }, ['from', 'to', 'subject']),
  },
  'resend:/v1/emails/batch': {
    requestBody: arr(
      obj({
        from: str('Sender email'),
        to: str('Recipient email'),
        subject: str('Email subject'),
        html: str('HTML body'),
      }, ['from', 'to', 'subject']),
      'Array of emails (up to 100)',
    ),
  },

  // Together
  'together:/v1/chat/completions': { requestBody: chatCompletionsRequest },
  'together:/v1/images/generations': { requestBody: imageGenRequest },
  'together:/v1/embeddings': { requestBody: embeddingsRequest },

  // ElevenLabs
  'elevenlabs:/v1/text-to-speech/:voiceId': {
    requestBody: obj({
      text: str('Text to convert to speech'),
      model_id: str('Model (eleven_multilingual_v2, eleven_turbo_v2)'),
      voice_settings: obj({
        stability: num('Voice stability (0-1)'),
        similarity_boost: num('Similarity boost (0-1)'),
      }),
    }, ['text']),
  },
  'elevenlabs:/v1/sound-generation': {
    requestBody: obj({
      text: str('Description of the sound to generate'),
      duration_seconds: num('Duration in seconds'),
    }, ['text']),
  },

  // OpenWeather
  'openweather:/v1/weather': {
    requestBody: obj({
      city: str('City name (e.g. "London" or "London,UK")'),
      lat: str('Latitude (alternative to city)'),
      lon: str('Longitude (alternative to city)'),
    }),
  },
  'openweather:/v1/forecast': {
    requestBody: obj({
      city: str('City name'),
      lat: str('Latitude'),
      lon: str('Longitude'),
    }),
  },

  // Google Maps
  'googlemaps:/v1/geocode': {
    requestBody: obj({
      address: str('Address to geocode (or use latlng for reverse)'),
      latlng: str('Latitude,longitude for reverse geocoding'),
    }),
  },
  'googlemaps:/v1/places': {
    requestBody: obj({
      query: str('Text search query (e.g. "restaurants in Sydney")'),
    }, ['query']),
  },
  'googlemaps:/v1/directions': {
    requestBody: obj({
      origin: str('Starting point (address or lat,lng)'),
      destination: str('Ending point (address or lat,lng)'),
      mode: str('Travel mode (driving, walking, bicycling, transit)'),
    }, ['origin', 'destination']),
  },

  // Judge0
  'judge0:/v1/submissions': {
    requestBody: obj({
      source_code: str('Source code to execute'),
      language_id: num('Language ID (see /v1/languages)'),
      stdin: str('Standard input'),
    }, ['source_code', 'language_id']),
  },
  'judge0:/v1/languages': { requestBody: obj({}) },

  // Lob
  'lob:/v1/postcards': {
    requestBody: obj({
      to: obj({
        name: str('Recipient name'),
        address_line1: str('Street address'),
        address_city: str('City'),
        address_state: str('State (2-letter)'),
        address_zip: str('ZIP code'),
      }, ['name', 'address_line1', 'address_city', 'address_state', 'address_zip']),
      front: str('Front HTML or template ID'),
      back: str('Back HTML or template ID'),
    }, ['to', 'front', 'back']),
  },
  'lob:/v1/letters': {
    requestBody: obj({
      to: obj({
        name: str('Recipient name'),
        address_line1: str('Street address'),
        address_city: str('City'),
        address_state: str('State'),
        address_zip: str('ZIP'),
      }, ['name', 'address_line1', 'address_city', 'address_state', 'address_zip']),
      from: obj({
        name: str('Sender name'),
        address_line1: str('Street address'),
        address_city: str('City'),
        address_state: str('State'),
        address_zip: str('ZIP'),
      }, ['name', 'address_line1', 'address_city', 'address_state', 'address_zip']),
      file: str('Letter content HTML or template ID'),
    }, ['to', 'from', 'file']),
  },
  'lob:/v1/verify': {
    requestBody: obj({
      primary_line: str('Street address'),
      city: str('City'),
      state: str('State'),
      zip_code: str('ZIP code'),
    }, ['primary_line']),
  },

  // CoinGecko
  'coingecko:/v1/price': {
    requestBody: obj({
      ids: str('Comma-separated coin IDs (e.g. "bitcoin,ethereum")'),
      vs_currencies: str('Comma-separated currencies (e.g. "usd,eur")'),
    }, ['ids', 'vs_currencies']),
  },
  'coingecko:/v1/markets': {
    requestBody: obj({
      vs_currency: str('Target currency (e.g. "usd")'),
      order: str('Sort order (market_cap_desc, volume_desc)'),
      per_page: str('Results per page (1-250)'),
    }, ['vs_currency']),
  },
  'coingecko:/v1/trending': { requestBody: obj({}) },

  // Alpha Vantage
  'alphavantage:/v1/quote': {
    requestBody: obj({
      symbol: str('Stock ticker symbol (e.g. "AAPL")'),
    }, ['symbol']),
  },
  'alphavantage:/v1/daily': {
    requestBody: obj({
      symbol: str('Stock ticker symbol'),
      outputsize: str('compact (100 days) or full'),
    }, ['symbol']),
  },
  'alphavantage:/v1/search': {
    requestBody: obj({
      keywords: str('Search keywords for symbol lookup'),
    }, ['keywords']),
  },

  // NewsAPI
  'newsapi:/v1/headlines': {
    requestBody: obj({
      country: str('2-letter country code (e.g. "us")'),
      category: str('Category (business, technology, science, etc.)'),
      q: str('Search keywords'),
    }),
  },
  'newsapi:/v1/search': {
    requestBody: obj({
      q: str('Search keywords'),
      from: str('Start date (YYYY-MM-DD)'),
      to: str('End date (YYYY-MM-DD)'),
      language: str('2-letter language code'),
      sortBy: str('Sort (relevancy, popularity, publishedAt)'),
    }, ['q']),
  },

  // DeepL
  'deepl:/v1/translate': {
    requestBody: obj({
      text: arr(str('Text to translate'), 'Array of texts'),
      target_lang: str('Target language code (e.g. "DE", "FR", "ES")'),
      source_lang: str('Source language code (auto-detected if omitted)'),
    }, ['text', 'target_lang']),
  },

  // Exa
  'exa:/v1/search': {
    requestBody: obj({
      query: str('Semantic search query'),
      numResults: num('Number of results (default 10)'),
      contents: obj({
        text: bool('Include extracted text'),
      }),
    }, ['query']),
  },
  'exa:/v1/contents': {
    requestBody: obj({
      ids: arr(str('Document ID'), 'Array of Exa document IDs'),
    }, ['ids']),
  },

  // Jina
  'jina:/v1/read': { requestBody: urlRequest },

  // Serper
  'serper:/v1/search': {
    requestBody: obj({
      q: str('Google search query'),
      gl: str('Country code (e.g. "us")'),
      hl: str('Language code'),
      num: num('Number of results'),
    }, ['q']),
  },
  'serper:/v1/images': {
    requestBody: obj({
      q: str('Image search query'),
      gl: str('Country code'),
      num: num('Number of results'),
    }, ['q']),
  },

  // Screenshot
  'screenshot:/v1/capture': {
    requestBody: obj({
      url: str('URL to capture'),
      viewport_width: str('Viewport width in pixels'),
      viewport_height: str('Viewport height in pixels'),
      format: str('Output format (png, jpeg, pdf)'),
    }, ['url']),
  },

  // PDFShift
  'pdfshift:/v1/convert': {
    requestBody: obj({
      source: str('HTML string or URL to convert to PDF'),
      landscape: bool('Landscape orientation'),
      margin: str('Page margin (e.g. "20px")'),
    }, ['source']),
  },

  // QR Code
  'qrcode:/v1/generate': {
    requestBody: obj({
      data: str('Content to encode in QR code'),
      size: str('Image size (e.g. "300x300")'),
      format: str('Output format (png, svg)'),
    }, ['data']),
  },

  // Replicate
  'replicate:/v1/predictions': {
    requestBody: obj({
      version: str('Model version hash'),
      input: obj({}),
    }, ['version', 'input']),
  },
  'replicate:/v1/predictions/status': {
    requestBody: obj({
      id: str('Prediction ID'),
    }, ['id']),
  },

  // Stability
  'stability:/v1/generate': {
    requestBody: obj({
      prompt: str('Text description of the image'),
      negative_prompt: str('What to exclude from the image'),
      output_format: str('Output format (png, jpeg, webp)'),
      aspect_ratio: str('Aspect ratio (1:1, 16:9, etc.)'),
    }, ['prompt']),
  },
  'stability:/v1/edit': {
    requestBody: obj({
      image: str('Base64 image to edit'),
      prompt: str('What to replace the search target with'),
      search_prompt: str('What to find in the image'),
    }, ['image', 'prompt', 'search_prompt']),
  },

  // AssemblyAI
  'assemblyai:/v1/transcribe': {
    requestBody: obj({
      audio_url: str('URL of the audio file'),
      speaker_labels: bool('Enable speaker diarization'),
      auto_chapters: bool('Auto-generate chapters'),
    }, ['audio_url']),
  },
  'assemblyai:/v1/result': {
    requestBody: obj({
      id: str('Transcription ID'),
    }, ['id']),
  },

  // Hunter
  'hunter:/v1/search': {
    requestBody: obj({
      domain: str('Domain to search (e.g. "stripe.com")'),
    }, ['domain']),
  },
  'hunter:/v1/verify': {
    requestBody: obj({
      email: str('Email address to verify'),
    }, ['email']),
  },

  // IPinfo
  'ipinfo:/v1/lookup': {
    requestBody: obj({
      ip: str('IP address to look up (omit for your own IP)'),
    }),
  },

  // Google Translate
  'translate:/v1/translate': {
    requestBody: obj({
      q: str('Text to translate'),
      target: str('Target language code (e.g. "es", "fr")'),
      source: str('Source language code (auto-detected if omitted)'),
    }, ['q', 'target']),
  },
  'translate:/v1/detect': {
    requestBody: obj({
      q: str('Text to detect language of'),
    }, ['q']),
  },

  // SerpAPI
  'serpapi:/v1/search': {
    requestBody: obj({
      q: str('Google search query'),
      location: str('Location for geo-targeted results'),
      gl: str('Country code'),
      hl: str('Language code'),
    }, ['q']),
  },
  'serpapi:/v1/flights': {
    requestBody: obj({
      departure_id: str('Departure airport IATA code (e.g. "LAX")'),
      arrival_id: str('Arrival airport IATA code (e.g. "NRT")'),
      outbound_date: str('Departure date (YYYY-MM-DD)'),
      return_date: str('Return date (YYYY-MM-DD)'),
    }, ['departure_id', 'arrival_id', 'outbound_date']),
  },
  'serpapi:/v1/locations': {
    requestBody: obj({
      q: str('Location search query'),
    }, ['q']),
  },

  // Printful
  'printful:/v1/products': {
    requestBody: obj({
      id: num('Product ID (omit to list all)'),
      category_id: num('Filter by category'),
    }),
  },
  'printful:/v1/estimate': {
    requestBody: obj({
      recipient: obj({
        address1: str('Street address'),
        city: str('City'),
        state_code: str('State code'),
        country_code: str('Country code (e.g. "US")'),
        zip: str('ZIP code'),
      }, ['address1', 'city', 'country_code', 'zip']),
      items: arr(
        obj({
          variant_id: num('Product variant ID'),
          quantity: num('Quantity'),
        }, ['variant_id', 'quantity']),
        'Order items',
      ),
    }, ['recipient', 'items']),
  },
  'printful:/v1/order': {
    requestBody: obj({
      recipient: obj({
        name: str('Recipient name'),
        address1: str('Street address'),
        city: str('City'),
        state_code: str('State code'),
        country_code: str('Country code'),
        zip: str('ZIP code'),
      }, ['name', 'address1', 'city', 'country_code', 'zip']),
      items: arr(
        obj({
          variant_id: num('Product variant ID'),
          quantity: num('Quantity'),
          files: arr(obj({ url: str('Print file URL') }, ['url']), 'Print files'),
        }, ['variant_id', 'quantity']),
        'Order items',
      ),
    }, ['recipient', 'items']),
  },

  // Pushover
  'pushover:/v1/push': {
    requestBody: obj({
      user: str('Pushover user key'),
      message: str('Notification message'),
      title: str('Notification title'),
      url: str('Supplementary URL'),
      priority: num('Priority (-2 to 2)'),
    }, ['user', 'message']),
  },

  // Mistral
  'mistral:/v1/chat/completions': { requestBody: chatCompletionsRequest },
  'mistral:/v1/embeddings': { requestBody: embeddingsRequest },

  // Cohere
  'cohere:/v1/chat': {
    requestBody: obj({
      model: str('Model (command-r-plus, command-r)'),
      messages: arr(
        obj({
          role: str('Role (user, assistant, system)'),
          content: str('Message content'),
        }, ['role', 'content']),
        'Conversation messages',
      ),
    }, ['messages']),
  },
  'cohere:/v1/embed': {
    requestBody: obj({
      texts: arr(str('Text to embed'), 'Array of texts'),
      model: str('Model (embed-v4.0, embed-multilingual-v3.0)'),
      input_type: str('Input type (search_document, search_query)'),
    }, ['texts', 'input_type']),
  },
  'cohere:/v1/rerank': {
    requestBody: obj({
      query: str('Search query to rerank against'),
      documents: arr(str('Document text'), 'Documents to rerank'),
      model: str('Model (rerank-v3.5)'),
      top_n: num('Number of top results to return'),
    }, ['query', 'documents']),
  },

  // VirusTotal
  'virustotal:/v1/scan': {
    requestBody: obj({
      url: str('URL to scan for threats'),
      hash: str('File hash (SHA-256/MD5) to look up'),
    }),
  },

  // ExchangeRate
  'exchangerate:/v1/rates': {
    requestBody: obj({
      base: str('Base currency code (e.g. "USD")'),
    }, ['base']),
  },
  'exchangerate:/v1/convert': {
    requestBody: obj({
      from: str('Source currency code'),
      to: str('Target currency code'),
      amount: num('Amount to convert'),
    }, ['from', 'to', 'amount']),
  },

  // Short.io
  'shortio:/v1/shorten': { requestBody: urlRequest },

};

export function getEndpointSchema(serviceId: string, path: string): EndpointSchema | undefined {
  return schemas[`${serviceId}:${path}`];
}

export function getAllSchemas(): Record<string, EndpointSchema> {
  return schemas;
}
