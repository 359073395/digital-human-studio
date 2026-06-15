# Add AI Product Image Presenter Mode

The app will add a second avatar mode called AI Product Image Presenter. This mode uses a user-uploaded product image plus a digital-human description prompt to generate a product-specific presenter image with OpenAI `gpt-image-2`, then sends that generated image to HeyGen for image-based lip-sync video generation.

The existing HeyGen preset avatar mode remains the default and continues to render with HeyGen avatar IDs. AI Product Image Presenter is an additional mode, not a replacement, because preset avatars are still the fastest path for stable MVP verification while generated presenter images are better for product-specific visuals.

The task stores avatar mode, digital-human description prompt, motion prompt, uploaded product image asset, and generated presenter image asset. Product image files and generated presenter images remain local task media assets; API keys remain in local credential storage.

This decision keeps the MVP API-first, supports product image upload, and creates a clear path for later image regeneration, outfit changes, and product-holding variations without introducing mixed-cut editing in the first implementation.
