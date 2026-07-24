# Ollama Summary Testing Notes

## Purpose

This testing was done to compare local LLM weather summary generation using Ollama.

The goal was to see if a local model could rewrite weather facts into a short weather summary without adding unsupported details.

This is only for testing and comparison. It is not meant to replace the current project implementation yet.

## Local Testing Setup

The testing was done locally using Ollama on Windows PowerShell.

Models tested:

- llama3.2
- llama3.1:8b

## How the Two Models Were Run

First, I checked that Ollama was installed:

```powershell
ollama --version
```

Then I checked which models were available locally:

```powershell
ollama list
```

The models can be pulled locally using:

```powershell
ollama pull llama3.2
ollama pull llama3.1:8b
```

The tests were run through the local Ollama API.

Ollama local API endpoint:

```text
http://localhost:11434/api/generate
```

## Test Facts Used

The tests used simple weather facts instead of a full route table. This made it easier to check if the model added details that were not provided.

Facts used:

- temperature: 70 F
- wind speed: 10 mph
- precipitation: 0 in
- humidity: 50%

No wind direction was provided.  
No sky or cloud condition was provided.  
No travel advice was provided.

## Test 1: llama3.2 Through Ollama API

PowerShell command:

```powershell
$body = @{
  model = "llama3.2"
  prompt = "Use only these facts and do not add new weather details: temperature 70 F, wind speed 10 mph, precipitation 0 in, humidity 50%. Write one short weather summary."
  stream = $false
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:11434/api/generate" -Body $body -ContentType "application/json"
```

Result:

```text
model      : llama3.2
response   : It's a relatively mild day with temperatures around 70°F, moderate winds at 10 mph, no precipitation, and moderate humidity levels of 50%.
done       : True
```

Finding:

The model stayed close to the provided facts with the stricter prompt.

## Test 2: llama3.1:8b Through Ollama API

PowerShell command:

```powershell
$body = @{
  model = "llama3.1:8b"
  prompt = "Rewrite only these facts into one short weather summary. Do not add cloud cover, sky condition, wind direction, travel advice, or any detail not listed. Facts: temperature 70 F; wind speed 10 mph; precipitation 0 in; humidity 50%."
  stream = $false
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:11434/api/generate" -Body $body -ContentType "application/json"
```

Result:

```text
model      : llama3.1:8b
response   : Currently, it is 70°F with a moderate wind speed of 10 mph and no precipitation, accompanied by a relatively dry air mass with a humidity level of 50%.
done       : True
```

Finding:

The 8B model gave better wording and stayed closer to the provided facts when the prompt clearly blocked unsupported details.

## Earlier Simple Prompt Issues

Before using stricter prompts, both models added unsupported details.

### llama3.2 Simple Prompt Issue

Prompt:

```text
Write one short weather summary for a route with temperature 70 F, wind speed 10 mph, precipitation 0 in, and humidity 50%.
```

Issue found:

```text
The model added "from the west" even though no wind direction was provided.
```

### llama3.1:8b Simple Prompt Issue

Prompt:

```text
Use only these facts and do not add new weather details: temperature 70 F, wind speed 10 mph, precipitation 0 in, humidity 50%. Write one short weather summary.
```

Issue found:

```text
The model added "partly cloudy" even though no sky or cloud condition was provided.
```

## Main Findings

The local LLM can write a useful weather summary, but it can still add unsupported details if the prompt is too open.

The 3B model added wind direction when no wind direction was provided.

The 8B model gave better wording, but it still added sky or cloud condition when the prompt was not strict enough.

The best result came from using the 8B model with a stronger prompt.

## Connection to the Llama 3B Branch

The Llama 3B branch uses this safer design:

```text
digest → generate → verify → fallback
```

This approach makes sense because Python computes the weather facts first, then the LLM only rewrites those facts. After that, verification can check if the summary invented unsupported numbers or details.

The validation agent can also run after the generated summary as an extra safety check. It can help flag summary issues before the user relies on the forecast.

## Conclusion

Based on this testing, a local LLM can be useful for weather summary generation, but it should not be trusted by itself.

The safer approach is:

```text
pre-compute the weather facts → let the model rewrite only those facts → validate the final summary
```

This supports using local LLM generation with validation instead of allowing the model to freely summarize raw route data.