use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = "js_create_layer")]
    fn js_create_layer(id: &str, key: i32);
    
    #[wasm_bindgen(js_name = "js_clear_screen")]
    fn js_clear_screen(layer_id: i32);
    
    #[wasm_bindgen(js_name = "js_set_screen_size")]
    fn js_set_screen_size(width: i32, height: i32, quality: i32);
    
    #[wasm_bindgen(js_name = "js_set_layer_size")]
    fn js_set_layer_size(layer_id: i32, width: i32, height: i32, quality: i32);
    
    #[wasm_bindgen(js_name = "js_request_tick")]
    fn js_request_tick();
    
    #[wasm_bindgen(js_name = "js_start_interval_tick")]
    fn js_start_interval_tick(ms: i32);
}

pub fn create_layer(id: &str, key: i32) {
    js_create_layer(id, key);
}

pub fn clear_screen(layer: i32) {
    js_clear_screen(layer);
}

pub fn set_layer_size(layer: i32, width: u32, height: u32, quality: u32) {
    js_set_layer_size(layer, width as i32, height as i32, quality as i32);
}

pub fn set_screen_size(width: u32, height: u32, quality: u32) {
    js_set_screen_size(width as i32, height as i32, quality as i32);
}

pub fn request_next_tick() {
    js_request_tick();
}

pub fn start_interval_tick(ms: i32) {
    js_start_interval_tick(ms);
}
