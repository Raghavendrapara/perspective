/******************************************************************************
 *
 * Copyright (c) 2018, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms
 * of the Apache License 2.0.  The full license can be found in the LICENSE
 * file.
 *
 */

export const wasm = import("./index.js");

import CONTAINER_STYLE from "../less/container.less";

let _index = undefined;
async function _await_index(f) {
    if (!_index) {
        _index = await wasm;
    }
    return f();
}

class PerspectiveStatusBarElement extends HTMLElement {
    constructor() {
        super();
        _await_index(() => {
            this._instance = new _index.StatusBarElement(this, CONTAINER_STYLE.toString());
        });
    }

    // connectedCallback() {
    //     _await_index(() => this._instance.connected_callback());
    // }

    set_view(...args) {
        return _await_index(() => this._instance.set_view(...args));
    }

    set_table(...args) {
        return _await_index(() => this._instance.set_table(...args));
    }
}

if (document.createElement("perspective-statusbar").constructor === HTMLElement) {
    window.customElements.define("perspective-statusbar", PerspectiveStatusBarElement);
}
