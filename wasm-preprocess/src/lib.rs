use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Preprocess image data by resizing to target dimensions
/// Returns preprocessed image data as RGBA bytes
#[wasm_bindgen]
pub fn preprocess_image(
    image_data: &[u8],
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> Vec<u8> {
    // Simple nearest-neighbor resize for RGBA images
    // In production, you'd use a proper image library
    let source_size = (source_width * source_height * 4) as usize;
    
    if image_data.len() < source_size {
        return Vec::new();
    }
    
    let mut output = Vec::with_capacity((target_width * target_height * 4) as usize);
    
    for y in 0..target_height {
        for x in 0..target_width {
            // Calculate source coordinates using nearest-neighbor
            let src_x = (x * source_width) / target_width;
            let src_y = (y * source_height) / target_height;
            
            let src_index = ((src_y * source_width + src_x) * 4) as usize;
            
            if src_index + 3 < image_data.len() {
                output.push(image_data[src_index]);
                output.push(image_data[src_index + 1]);
                output.push(image_data[src_index + 2]);
                output.push(image_data[src_index + 3]);
            } else {
                // Padding with transparent black if out of bounds
                output.push(0);
                output.push(0);
                output.push(0);
                output.push(0);
            }
        }
    }
    
    output
}

/// Simple text tokenization - converts text to token IDs
/// This is a placeholder implementation. In production, you'd use
/// a proper tokenizer that matches your model's vocabulary.
#[wasm_bindgen]
pub fn preprocess_text(text: &str) -> Vec<u32> {
    // Simple word-based tokenization
    // In production, use a proper tokenizer (e.g., tiktoken, sentencepiece)
    text.split_whitespace()
        .enumerate()
        .map(|(idx, _)| idx as u32 + 1) // Simple sequential token IDs
        .collect()
}

/// Normalize text input - lowercase, trim, remove extra whitespace
#[wasm_bindgen]
pub fn normalize_text(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

/// Get preprocessing statistics
#[wasm_bindgen]
pub fn get_preprocess_stats(
    original_size: u32,
    target_size: u32,
) -> PreprocessStats {
    PreprocessStats {
        original_size,
        target_size,
        scale_factor: target_size as f64 / original_size as f64,
    }
}

#[wasm_bindgen]
pub struct PreprocessStats {
    pub original_size: u32,
    pub target_size: u32,
    pub scale_factor: f64,
}

