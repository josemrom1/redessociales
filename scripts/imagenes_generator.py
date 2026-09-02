import json
import os
from datetime import datetime
from pathlib import Path

from google import genai


def generate_post_text(client: genai.Client, order: str) -> str:
    prompt = (
        "You are a social media copywriter. Write one short, natural post sentence for today. "
        "Return only the final sentence, no quotes, no hashtags unless clearly relevant.\n\n"
        f"User order/context: {order}"
    )

    interaction = client.interactions.create(
        model="models/gemini-3.1-flash-lite-image",
        input=prompt,
        generation_config={
            "temperature": 0.9,
            "max_output_tokens": 1024,
            "top_p": 0.95,
            "thinking_level": "minimal",
        },
        response_modalities=["text"],
    )

    for step in interaction.steps:
        if step.type == "model_output" and step.content:
            for part in step.content:
                if part.type == "text" and part.text.strip():
                    return part.text.strip()

    raise RuntimeError("No text generated")


def generate_image(client: genai.Client, text: str, out_dir: Path) -> Path:
    image_prompt = (
        "Create a high-quality social media image concept aligned with this post text. "
        "Clean composition, warm natural lighting, aesthetically pleasing, no readable text in image.\n\n"
        f"Post text: {text}"
    )

    interaction = client.interactions.create(
        model="models/gemini-3.1-flash-lite-image",
        input=image_prompt,
        generation_config={
            "temperature": 1,
            "max_output_tokens": 65536,
            "top_p": 0.95,
            "thinking_level": "minimal",
        },
        response_modalities=["image", "text"],
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    for step in interaction.steps:
        if step.type == "model_output" and step.content:
            for part in step.content:
                if part.type == "image":
                    import base64

                    img_bytes = base64.b64decode(part.data)
                    filename = datetime.now().strftime("image_%Y%m%d_%H%M%S.png")
                    out_path = out_dir / filename
                    out_path.write_bytes(img_bytes)
                    return out_path

    raise RuntimeError("No image generated")


def main() -> None:
    order = os.environ.get("POST_ORDER", "Create today post")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY environment variable")

    client = genai.Client(api_key=api_key)

    post_text = os.environ.get("POST_TEXT", "").strip() or generate_post_text(client, order)
    image_path = generate_image(client, post_text, Path("generated_images"))

    output = {
        "post_text": post_text,
        "image_path": str(image_path.resolve()),
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
