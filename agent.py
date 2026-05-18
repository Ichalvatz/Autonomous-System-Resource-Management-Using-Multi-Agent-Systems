import os
from dotenv import load_dotenv
from huggingface_hub import InferenceClient

load_dotenv()

## You need a token from https://hf.co/settings/tokens, ensure that you select 'read' as the token type. If you run this on Google Colab, you can set it up in the "settings" tab under "secrets". Make sure to call it "HF_TOKEN"
HF_TOKEN = os.environ.get("HF_TOKEN")

client = InferenceClient(model="moonshotai/Kimi-K2.5")

output = client.chat.completions.create(
    messages=[
        {"role": "user", "content": "The capital of France is"},
    ],
    stream=False,
    max_tokens=1024,
    extra_body={'thinking': {'type': 'disabled'}},
)
print(output.choices[0].message.content)

# This system prompt is a bit more complex and actually contains the function description already appended.
# Here we suppose that the textual description of the tools has already been appended.

SYSTEM_PROMPT = """<|begin_of_text|><|start_header_id|>system<|end_header_id|>
Answer the following questions as best you can. You have access to the following tools:

get_weather: Get the current weather in a given location

The way you use the tools is by specifying a json blob.
Specifically, this json should have a `action` key (with the name of the tool to use) and a `action_input` key (with the input to the tool going here).

The only values that should be in the "action" field are:
get_weather: Get the current weather in a given location, args: {"location": {"type": "string"}}
example use :

{
  "action": "get_weather",
  "action_input": {"location": "New York"}
}

ALWAYS use the following format:

Question: the input question you must answer
Thought: you should always think about one action to take. Only one action at a time in this format:
Action:

$JSON_BLOB (inside markdown cell)

Observation: the result of the action. This Observation is unique, complete, and the source of truth.
... (this Thought/Action/Observation can repeat N times, you should take several steps when needed. The $JSON_BLOB must be formatted as markdown and only use a SINGLE action at a time.)

You must always end your output with the following format:

Thought: I now know the final answer
Final Answer: the final answer to the original input question

Now begin! Reminder to ALWAYS use the exact characters `Final Answer:` when you provide a definitive answer.
<|eot_id|><|start_header_id|>user<|end_header_id|>
What's the weather in London?
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
Thought: To answer the question, I need to get the current weather in London.
Action:

    ```json
    {
      "action": "get_weather",
      "action_input": {"location": {"type": "string", "value": "London"}}
    }
    ```

Observation: The weather in London is sunny with low temperatures."""

messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": "What's the weather in Thessaloniki?"},
]

print(messages)


output = client.chat.completions.create(
    messages=messages,
    stream=False,
    max_tokens=200,
    extra_body={'thinking': {'type': 'disabled'}},
)
print(output.choices[0].message.content)

output = client.chat.completions.create(
    messages=messages,
    max_tokens=150,
    stop=["Observation:"], # Let's stop before any actual function is called
    extra_body={'thinking': {'type': 'disabled'}},
)

print(output.choices[0].message.content)

def get_weather(location):
    return f"the weather in {location} is sunny with low temperatures. \n"

get_weather('Thessaloniki')

messages=[
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": "What's the weather in Thessaloniki ?"},
    {"role": "assistant", "content": output.choices[0].message.content + "Observation:\n" + get_weather('Thessaloniki')},
]

output = client.chat.completions.create(
    messages=messages,
    stream=False,
    max_tokens=200,
    extra_body={'thinking': {'type': 'disabled'}},
)

print(output.choices[0].message.content)