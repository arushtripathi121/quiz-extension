# Gemini Form AutoFill - Chrome Extension

A production-ready Chrome extension that automatically fills Google Forms using Google's Gemini AI API.

## Features

✅ **Handles Large Forms** - Adaptive chunking prevents token limit errors
✅ **Smart Retry Logic** - Automatic retries with exponential backoff
✅ **Multiple Question Types** - Supports MCQ, checkboxes, short answer, and paragraph questions
✅ **Real-time Status Updates** - Visual feedback during processing
✅ **Error Recovery** - Continues processing even if some chunks fail
✅ **Production Optimized** - Rate limiting, error handling, and efficient token usage

## Installation

### 1. Get Your Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy your API key (it starts with `AIza...`)

### 2. Install the Extension

1. Download all files to a folder:
   - `manifest.json`
   - `background.js`
   - `content.js`
   - `popup.html`
   - `popup.js`

2. Create placeholder icons (or use your own):
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

3. Open Chrome and go to `chrome://extensions/`

4. Enable "Developer mode" (top right toggle)

5. Click "Load unpacked" and select your extension folder

### 3. Configure the Extension

1. Click the extension icon in your Chrome toolbar
2. Paste your Gemini API key
3. Click "Save Key"

## Usage

1. Open any Google Form (e.g., `https://docs.google.com/forms/...`)
2. Click the extension icon
3. Click "Fill Current Form"
4. Watch as the form gets automatically filled!

## How It Works

### Adaptive Chunking
The extension intelligently splits large forms into chunks based on:
- Estimated token count (~4 characters per token)
- Maximum 3000 tokens per chunk (input)
- Up to 4096 tokens for responses (output)

### Processing Pipeline
```
Extract Questions → Split into Chunks → Process with Gemini → Fill Form
                         ↓
                    Retry on Failure
```

### Question Type Handling
- **Multiple Choice (MCQ)**: Selects exact option text
- **Checkboxes**: Can select multiple options
- **Short Answer**: Provides concise text responses
- **Paragraph**: Generates 2-3 sentence answers

## Optimization Features

### 1. Token Management
- Adaptive chunking based on question complexity
- Conservative token limits to prevent API errors
- Efficient prompt engineering

### 2. Error Handling
- Retry logic with exponential backoff
- Graceful degradation (continues if chunks fail)
- Detailed error reporting

### 3. Performance
- Async processing for better UX
- Visual progress indicators
- Batched API requests

### 4. Safety
- Content safety settings configured
- API key stored securely in Chrome storage
- Input sanitization and validation

## Troubleshooting

### "NO_API_KEY" Error
**Solution**: Make sure you've saved your Gemini API key in the extension popup.

### "Content was blocked by safety filters"
**Solution**: Some form content may trigger safety filters. Try rephrasing questions or use a different form.

### Form Not Filling Completely
**Possible causes**:
1. **Token limit exceeded**: The extension handles this automatically with chunking
2. **API rate limiting**: Wait a few seconds and try again
3. **Network issues**: Check your internet connection

### Extension Not Working on Form
**Check**:
1. URL must be `docs.google.com/forms/*`
2. Refresh the page after installing the extension
3. Check the browser console (F12) for errors

## API Costs

Gemini API offers a generous free tier:
- **Free quota**: 15 requests per minute
- **Token limits**: 
  - Input: 32,767 tokens per request
  - Output: 8,192 tokens per request

For most forms, this extension stays well within limits.

## File Structure

```
gemini-form-autofill/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (API calls)
├── content.js            # Form extraction & filling
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── icon16.png            # 16x16 icon
├── icon48.png            # 48x48 icon
└── icon128.png           # 128x128 icon
```

## Technical Details

### Chrome APIs Used
- `chrome.storage.local`: Secure API key storage
- `chrome.runtime`: Message passing between scripts
- `chrome.scripting`: Dynamic content script injection

### Gemini API Configuration
```javascript
{
  model: "gemini-2.0-flash-exp",
  temperature: 0.2,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 4096,
  responseMimeType: "application/json"
}
```

### Chunk Size Calculation
```javascript
// Conservative limit for input
MAX_TOKENS_PER_CHUNK = 3000

// Rough estimate: ~4 characters per token
tokenEstimate = (questionLength + optionsLength) / 4
```

## Security Considerations

- ✅ API keys stored locally (never transmitted except to Gemini API)
- ✅ HTTPS-only communication
- ✅ Minimal permissions requested
- ✅ No third-party analytics or tracking
- ✅ Content Security Policy enforced

## Limitations

- Only works on Google Forms (`docs.google.com/forms/*`)
- Requires active internet connection
- Subject to Gemini API rate limits
- AI-generated answers may not always be 100% accurate

## Contributing

To improve this extension:

1. **Better Option Matching**: Improve fuzzy matching for MCQ options
2. **Caching**: Cache similar questions to reduce API calls
3. **Custom Answers**: Allow users to provide custom answers for specific questions
4. **Analytics**: Add success rate tracking

## License

MIT License - Feel free to modify and distribute

## Disclaimer

This extension is for educational and productivity purposes. Always review AI-generated answers before submitting forms. The accuracy of answers depends on the Gemini AI model and the quality of the questions.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console logs (F12 → Console)
3. Verify API key is valid and has quota remaining