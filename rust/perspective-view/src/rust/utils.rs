////////////////////////////////////////////////////////////////////////////////
//
// Copyright (c) 2018, the Perspective Authors.
//
// This file is part of the Perspective library, distributed under the terms
// of the Apache License 2.0.  The full license can be found in the LICENSE
// file.

#![macro_use]

use std::future::Future;
use typed_html::dom::{DOMTree, VNode};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::{future_to_promise, JsFuture};
use web_sys::{Document, Element};

pub type JsResult<T> = Result<T, JsValue>;

/// Console FFI
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    pub fn log_val(s: &JsValue);

    #[wasm_bindgen(js_namespace = console, js_name = log)]
    pub fn log_obj(s: &js_sys::Object);

    #[wasm_bindgen(js_namespace = console, js_name = log)]
    pub fn log_str(s: &str);
}

/// Perspective FFI
#[wasm_bindgen]
extern "C" {
    #[derive(Clone)]
    pub type PerspectiveJsTable;

    #[wasm_bindgen(method, js_name = size)]
    pub fn _size(this: &PerspectiveJsTable) -> js_sys::Promise;

    #[wasm_bindgen(method, js_name = view)]
    pub fn _view(this: &PerspectiveJsTable, config: js_sys::Object) -> js_sys::Promise;

    #[derive(Clone)]
    pub type PerspectiveJsView;

    #[wasm_bindgen(method, js_name = delete)]
    pub fn _delete(this: &PerspectiveJsView) -> js_sys::Promise;

    #[wasm_bindgen(method, js_name = to_csv)]
    pub fn _to_csv(
        this: &PerspectiveJsView,
        options: js_sys::Object,
    ) -> js_sys::Promise;

    #[wasm_bindgen(method, js_name = num_rows)]
    pub fn _num_rows(this: &PerspectiveJsView) -> js_sys::Promise;

    #[wasm_bindgen(method)]
    pub fn on_update(this: &PerspectiveJsView, callback: js_sys::Function);

    #[wasm_bindgen(method, js_name = get_config)]
    pub fn _get_config(this: &PerspectiveJsView) -> js_sys::Promise;

    pub type PerspectiveJsViewConfig;

    #[wasm_bindgen(method, getter)]
    pub fn row_pivots(this: &PerspectiveJsViewConfig) -> js_sys::Array;

    #[wasm_bindgen(method, getter)]
    pub fn column_pivots(this: &PerspectiveJsViewConfig) -> js_sys::Array;
}

macro_rules! promise_to_async {
    (@jsvalue $sym:ident ()) => {{ $sym.await?; }};
    (@jsvalue $sym:ident f64) => { $sym.await?.as_f64().unwrap() };
    (@jsvalue $sym:ident $type:ty) => { $sym.await?.unchecked_into::<$type>() };
    ($old_fn:ident, $new_fn:ident($($arg:ident : $argtype:ty),*) -> $($type:tt)+) => {
        pub fn $new_fn(
            &self,
            $($arg: $argtype),*
        ) -> impl Future<Output = Result<$($type)*, JsValue>> {
            let fut: JsFuture = JsFuture::from(self.$old_fn($($arg)*));
            async move { Ok(promise_to_async!(@jsvalue fut $($type)*)) }
        }
    };
}

impl PerspectiveJsTable {
    promise_to_async!(_view, view(config: js_sys::Object) -> PerspectiveJsView);
    promise_to_async!(_size, size() -> f64);
}

impl PerspectiveJsView {
    promise_to_async!(_to_csv, to_csv(options: js_sys::Object) -> js_sys::JsString);
    promise_to_async!(_get_config, get_config() -> PerspectiveJsViewConfig);
    promise_to_async!(_num_rows, num_rows() -> f64);
    promise_to_async!(_delete, delete() -> ());
}

/// Apply a style node to the target `elem`.
pub fn apply_style_node(elem: &Element, css: &str) -> Result<(), JsValue> {
    let document = &web_sys::window().unwrap().document().unwrap();
    let style = document.create_element("style")?;
    style.set_text_content(Some(css));
    elem.append_child(&style)?;
    Ok(())
}

pub fn apply_dom_tree(
    elem: &Element,
    tree: &mut DOMTree<String>,
) -> Result<(), JsValue> {
    let document = &web_sys::window().unwrap().document().unwrap();
    match tree.vnode() {
        VNode::Element(x) => {
            for child in x.children {
                apply_vnode(document, elem, &child)?;
            }
        }
        _ => unimplemented!(),
    }

    Ok(())
}

fn apply_vnode(
    document: &Document,
    elem: &Element,
    node: &VNode<'_, String>,
) -> Result<(), JsValue> {
    match node {
        VNode::Text(text) | VNode::UnsafeText(text) => {
            let node = document.create_text_node(&text);
            elem.append_child(&node).map(|_| ())?;
            Ok(())
        }
        VNode::Element(element) => {
            let node = document.create_element(element.name)?;
            for (key, value) in &element.attributes {
                node.set_attribute(&key, &value)?;
            }

            for child in &element.children {
                apply_vnode(document, &node, &child)?;
            }

            elem.append_child(&node)?;
            Ok(())
        }
    }
}

pub trait PerspectiveComponent: Clone {
    /// The root `HtmlElement` to which this component renders.
    fn get_root(&self) -> &web_sys::HtmlElement;

    /// Convenience function for injecting `self` into ` closure which returns a
    /// `Future`, the Rust equivalent of an `AsyncFn`.  It handles both the lifetime of
    /// `self` as well as wrapping the inner `Future` in a JavaScript `Promise` (or it
    /// would not execute).
    fn async_method_to_jsfunction<F, T>(&self, f: F) -> js_sys::Function
    where
        T: Future<Output = Result<JsValue, JsValue>> + 'static,
        F: Fn(Self) -> T + 'static,
        Self: 'static,
    {
        let this = self.clone();
        let cb = move || future_to_promise(f(this.clone()));
        let box_cb: Box<dyn Fn() -> js_sys::Promise> = Box::new(cb);
        Closure::wrap(box_cb).into_js_value().unchecked_into()
    }

    /// Convenience function for wrapping and injecting `self` into a `Future`.
    fn async_method_to_jspromise<F, T>(&self, f: F) -> js_sys::Promise
    where
        T: Future<Output = Result<JsValue, JsValue>> + 'static,
        F: FnOnce(Self) -> T + 'static,
        Self: 'static,
    {
        let this = self.clone();
        future_to_promise(f(this.clone()))
    }

    /// Convenience function for wrapping and injecting `self` into a closure with an
    /// argument (a common pattern for event handles in JavaScript).
    fn method_to_jsfunction_arg1<F, T>(&self, f: F) -> js_sys::Function
    where
        T: wasm_bindgen::convert::FromWasmAbi + 'static,
        F: Fn(&Self, T) -> Result<(), JsValue> + 'static,
        Self: 'static,
    {
        let this = self.clone();
        let box_cb: Box<dyn Fn(T) -> Result<(), JsValue>> =
            Box::new(move |e| f(&this, e));
        Closure::wrap(box_cb).into_js_value().unchecked_into()
    }
}

#[cfg(test)]
mod perspective_component_tests {
    use crate::utils::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);

    #[derive(Clone)]
    struct Test {}

    impl PerspectiveComponent for Test {
        fn get_root(&self) -> &web_sys::HtmlElement {
            unimplemented!()
        }
    }

    #[wasm_bindgen_test]
    fn test_async_method_to_jsfunction() {
        async fn f(_: Test) -> Result<JsValue, JsValue> {
            Ok(JsValue::UNDEFINED)
        }

        let _: js_sys::Function = (Test {}).async_method_to_jsfunction(f);
    }

    #[wasm_bindgen_test]
    fn test_async_method_to_jspromise() {
        async fn f(_: Test) -> Result<JsValue, JsValue> {
            Ok(JsValue::UNDEFINED)
        }

        let _: js_sys::Promise = (Test {}).async_method_to_jspromise(f);
    }
}

#[macro_export]
macro_rules! js_object {
    () => { js_sys::Object::new() };

    ($($key:expr, $value:expr);+ $(;)*) => {{
        use js_intern::{js_intern};
        let o = js_sys::Object::new();
        $({
            let k = js_intern!($key);
            js_sys::Reflect::set(&o, k, &$value.into()).unwrap();
        })*
        o
    }};

    ($o:expr; with $($key:expr, $value:expr);+ $(;)*) => { {
        use js_intern::{js_intern};
        $({
            let k = js_intern!($key);
            Reflect::set($o, k, &$value.into()).unwrap();
        })*
        $o
    }};
}
