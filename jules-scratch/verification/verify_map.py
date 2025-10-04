from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the maps page
            page.goto("http://localhost:3000/maps", timeout=60000)

            # Wait for the map container to be present
            map_container = page.locator(".leaflet-container")
            expect(map_container).to_be_visible(timeout=30000)

            # Wait for the GeoJSON layer to be loaded by looking for a path element
            # This is a good indicator that the country outlines have been rendered
            geojson_layer = page.locator("path.leaflet-interactive")
            expect(geojson_layer.first).to_be_visible(timeout=30000)

            # Give a little extra time for tiles to fully render
            page.wait_for_timeout(2000)

            # Take a screenshot
            screenshot_path = "jules-scratch/verification/verification.png"
            page.screenshot(path=screenshot_path)

            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"An error occurred: {e}")

        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()