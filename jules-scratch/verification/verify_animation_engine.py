from playwright.sync_api import sync_playwright, expect

def handle_dialog(dialog):
    """A simple handler to print and dismiss unexpected alerts."""
    print(f"Intercepted dialog: {dialog.type} - {dialog.message}")
    dialog.dismiss()

def run_verification(page):
    """
    This script verifies the new high-speed animation engine.
    """
    # Register the dialog handler before navigating
    page.on("dialog", handle_dialog)

    print("Navigating to the maps page...")
    page.goto("http://localhost:3000/maps")

    # 1. Search for a location to ensure events are loaded
    print("Searching for 'California'...")
    search_input = page.get_by_placeholder("Search for a location...")
    search_input.fill("California")
    search_button = page.get_by_role("button", name="Search")
    search_button.click()

    # Wait for the event accordion to appear
    print("Waiting for events to load...")
    expect(page.get_by_text("Events in California")).to_be_visible(timeout=20000)

    # 2. Click the first event to open it
    print("Opening the first available event...")
    # This selector is more robust. It finds the first accordion item and then the trigger button within it.
    # This avoids relying on the non-deterministic text from the AI.
    first_event_trigger = page.locator('[data-radix-accordion-item]').first.get_by_role('button')

    expect(first_event_trigger).to_be_visible(timeout=10000)
    first_event_trigger.click()

    # 3. Click the "View True Color" button to generate the animation
    print("Requesting 'True Color' animation...")
    true_color_button = page.get_by_role("button", name="View True Color")
    true_color_button.click()

    # 4. Wait for the animation dialog and the video to be ready
    print("Waiting for animation dialog to appear...")
    dialog_title = page.get_by_role("heading", name="Generating Animation")
    expect(dialog_title).to_be_visible(timeout=10000)

    print("Waiting for the animation video to be rendered...")
    # The video will be rendered when the status is 'success'
    # We wait for the video element itself to appear.
    animation_video = page.locator("video")
    expect(animation_video).to_be_visible(timeout=60000) # GEE can still take a moment

    # 5. Take a screenshot
    print("Capturing screenshot...")
    page.screenshot(path="jules-scratch/verification/verification.png")
    print("Screenshot saved to jules-scratch/verification/verification.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
        finally:
            browser.close()

if __name__ == "__main__":
    main()