from PIL import Image

def crop_logo_by_color(image_path, threshold=250):
    try:
        im = Image.open(image_path)
        # Ensure it's in RGB or RGBA mode
        im_rgb = im.convert("RGB")
        width, height = im_rgb.size
        
        left = width
        top = height
        right = 0
        bottom = 0
        
        # Scan all pixels to find non-white pixels
        pixels = im_rgb.load()
        found_non_white = False
        
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]
                # If the pixel is not white/off-white (R, G, or B is below threshold)
                if r < threshold or g < threshold or b < threshold:
                    found_non_white = True
                    if x < left:
                        left = x
                    if x > right:
                        right = x
                    if y < top:
                        top = y
                    if y > bottom:
                        bottom = y
                        
        if found_non_white:
            # Crop to the detected bounding box plus 2 pixels padding for safety
            padding = 2
            left = max(0, left - padding)
            top = max(0, top - padding)
            right = min(width, right + padding)
            bottom = min(height, bottom + padding)
            
            cropped = im.crop((left, top, right, bottom))
            cropped.save(image_path)
            print(f"Aggressive crop success! New size: {cropped.size}")
        else:
            print("No non-white pixels found with current threshold.")
    except Exception as e:
        print(f"Error: {e}")

crop_logo_by_color("logo.png")
