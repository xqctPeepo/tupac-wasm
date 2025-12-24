use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = "js_random")]
    fn js_random() -> f32;
    
    #[wasm_bindgen(js_name = "js_random_range")]
    fn js_random_range(min: i32, max: i32) -> i32;
    
    #[wasm_bindgen(js_name = "js_log")]
    fn js_log(msg: &str);
}

// TODO: apparently the rand crate now works with wasm.
// Switch to that!

pub fn random_range(min: i32, max: i32) -> i32 {
    js_random_range(min, max)
}

pub fn random() -> f32 {
    js_random()
}

pub fn log(msg: &str) {
    js_log(msg);
}

pub fn log_fmt(msg: String) {
    js_log(&msg);
}
