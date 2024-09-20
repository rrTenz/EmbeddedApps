import os
from PIL import Image

def convert_webp_to_png():
    # Get the current working directory
    current_dir = os.getcwd()

    # Loop through all files in the current directory
    for filename in os.listdir(current_dir):
        if filename.endswith('.webp'):
            # Open the .webp file
            webp_image = Image.open(filename)
            
            # Convert the file name from .webp to .png
            png_filename = filename.rsplit('.', 1)[0] + '.png'
            
            # Save the image as .png
            webp_image.save(png_filename, 'PNG')
            print(f"Converted {filename} to {png_filename}")

if __name__ == "__main__":
    convert_webp_to_png()
