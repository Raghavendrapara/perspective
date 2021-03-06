/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

import {get_type_config} from "@finos/perspective/dist/esm/config/index.js";

function styleListener(regularTable) {
    const header_depth = regularTable._view_cache.config.row_pivots.length - 1;
    let group_headers = Array.from(regularTable.children[0].children[0].children);
    let [col_headers] = group_headers.splice(group_headers.length - 1, 1);
    for (const td of col_headers?.children) {
        const metadata = regularTable.getMeta(td);
        const sort = this._config.sort.find(x => x[0] === metadata.column_header[metadata.column_header.length - 1]);
        let needs_border = metadata.row_header_x === header_depth;
        needs_border = needs_border || (metadata.x + 1) % this._config.columns.length === 0;
        td.classList.toggle("psp-header-border", needs_border);
        td.classList.toggle("psp-header-group", false);
        td.classList.toggle("psp-header-leaf", true);
        td.classList.toggle("psp-header-corner", typeof metadata.x === "undefined");
        td.classList.toggle("psp-header-sort-asc", !!sort && sort[1] === "asc");
        td.classList.toggle("psp-header-sort-desc", !!sort && sort[1] === "desc");
        td.classList.toggle("psp-header-sort-col-asc", !!sort && sort[1] === "col asc");
        td.classList.toggle("psp-header-sort-col-desc", !!sort && sort[1] === "col desc");

        let type = get_psp_type.call(this, metadata);
        const is_numeric = type === "integer" || type === "float";
        const float_val = is_numeric && parseFloat(metadata.value);
        td.classList.toggle("psp-align-right", is_numeric);
        td.classList.toggle("psp-align-left", !is_numeric);
        td.classList.toggle("psp-positive", float_val > 0);
        td.classList.toggle("psp-negative", float_val < 0);
    }

    for (const tr of group_headers) {
        for (const td of tr.children) {
            const metadata = regularTable.getMeta(td);
            let needs_border = metadata.row_header_x === header_depth || metadata.x >= 0;
            td.classList.toggle("psp-header-group", true);
            td.classList.toggle("psp-header-leaf", false);
            td.classList.toggle("psp-header-border", needs_border);
        }
    }

    for (const tr of regularTable.children[0].children[1].children) {
        for (const td of tr.children) {
            const metadata = regularTable.getMeta(td);
            if (td.tagName === "TH") {
                const is_not_empty = !!metadata.value && metadata.value.toString().trim().length > 0;
                const is_leaf = metadata.row_header_x >= this._config.row_pivots.length;
                const next = regularTable.getMeta({dx: 0, dy: metadata.y - metadata.y0 + 1});
                const is_collapse = next && next.row_header && typeof next.row_header[metadata.row_header_x + 1] !== "undefined";
                td.classList.toggle("psp-tree-label", is_not_empty && !is_leaf);
                td.classList.toggle("psp-tree-label-expand", is_not_empty && !is_leaf && !is_collapse);
                td.classList.toggle("psp-tree-label-collapse", is_not_empty && !is_leaf && is_collapse);
                td.classList.toggle("psp-tree-leaf", is_not_empty && is_leaf);
            }

            let type = get_psp_type.call(this, metadata);
            const is_numeric = type === "integer" || type === "float";
            const float_val = is_numeric && parseFloat(metadata.value);
            td.classList.toggle("psp-align-right", is_numeric);
            td.classList.toggle("psp-align-left", !is_numeric);
            td.classList.toggle("psp-positive", float_val > 0);
            td.classList.toggle("psp-negative", float_val < 0);
        }
    }
}

function get_psp_type(metadata) {
    if (metadata.x >= 0) {
        const column_path = this._column_paths[metadata.x];
        const column_path_parts = column_path.split("|");
        return this._schema[column_path_parts[column_path_parts.length - 1]];
    } else {
        const column_path = this._config.row_pivots[metadata.row_header_x - 1];
        return this._table_schema[column_path];
    }
}

async function sortHandler(regularTable, event) {
    const meta = regularTable.getMeta(event.target);
    const column_name = meta.column_header[meta.column_header.length - 1];
    const sort_method = event.shiftKey ? append_sort : override_sort;
    const sort = sort_method.call(this, column_name);
    regularTable.dispatchEvent(new CustomEvent("regular-table-psp-sort", {detail: {sort}}));
}

function append_sort(column_name) {
    const sort = [];
    let found = false;
    for (const sort_term of this._config.sort) {
        const [_column_name, _sort_dir] = sort_term;
        if (_column_name === column_name) {
            found = true;
            const term = create_sort.call(this, column_name, _sort_dir);
            if (term) {
                sort.push(term);
            }
        } else {
            sort.push(sort_term);
        }
    }
    if (!found) {
        sort.push([column_name, "desc"]);
    }
    return sort;
}
function override_sort(column_name) {
    for (const [_column_name, _sort_dir] of this._config.sort) {
        if (_column_name === column_name) {
            const sort = create_sort.call(this, column_name, _sort_dir);
            return sort ? [sort] : [];
        }
    }
    return [[column_name, "desc"]];
}
function create_sort(column_name, sort_dir) {
    const is_col_sortable = this._config.column_pivots.length > 0;
    const order = is_col_sortable ? ROW_COL_SORT_ORDER : ROW_SORT_ORDER;
    const inc_sort_dir = sort_dir ? order[sort_dir] : "desc";
    if (inc_sort_dir) {
        return [column_name, inc_sort_dir];
    }
}

const ROW_SORT_ORDER = {desc: "asc", asc: undefined};
const ROW_COL_SORT_ORDER = {desc: "asc", asc: "col desc", "col desc": "col asc", "col asc": undefined};

async function expandCollapseHandler(regularTable, event) {
    const meta = regularTable.getMeta(event.target);
    const is_collapse = event.target.classList.contains("psp-tree-label-collapse");
    if (event.shiftKey && is_collapse) {
        this._view.set_depth(meta.row_header.filter(x => x !== undefined).length - 2);
    } else if (event.shiftKey) {
        this._view.set_depth(meta.row_header.filter(x => x !== undefined).length - 1);
    } else if (is_collapse) {
        this._view.collapse(meta.y);
    } else {
        this._view.expand(meta.y);
    }
    this._num_rows = await this._view.num_rows();
    this._num_columns = await this._view.num_columns();
    regularTable.draw();
}

function mousedownListener(regularTable, event) {
    if (event.target.classList.contains("psp-tree-label") && event.offsetX < 26) {
        expandCollapseHandler.call(this, regularTable, event);
        event.handled = true;
    } else if (event.target.classList.contains("psp-header-leaf") && !event.target.classList.contains("psp-header-corner")) {
        sortHandler.call(this, regularTable, event);
        event.handled = true;
    }
}

const FORMATTERS = {};

const FORMATTER_CONS = {
    datetime: Intl.DateTimeFormat,
    date: Intl.DateTimeFormat,
    integer: Intl.NumberFormat,
    float: Intl.NumberFormat
};

export const formatters = FORMATTERS;

function _format(parts, val, use_table_schema = false) {
    if (val === null) {
        return "-";
    }
    const title = parts[parts.length - 1];
    const type = (use_table_schema && this._table_schema[title]) || this._schema[title] || "string";
    if (FORMATTERS[type] === undefined) {
        const type_config = get_type_config(type);
        if (FORMATTER_CONS[type] && type_config.format) {
            FORMATTERS[type] = new FORMATTER_CONS[type]("en-us", type_config.format);
        } else {
            FORMATTERS[type] = false;
        }
    }

    return FORMATTERS[type] ? FORMATTERS[type].format(val) : val;
}

function* _tree_header(paths = [], row_headers) {
    for (let path of paths) {
        path = ["TOTAL", ...path];
        const last = path[path.length - 1];
        path = path.slice(0, path.length - 1).fill("");
        const formatted = _format.call(this, [row_headers[path.length - 1]], last, true);
        path = path.concat({toString: () => formatted});
        path.length = row_headers.length + 1;
        yield path;
    }
}

async function dataListener(x0, y0, x1, y1) {
    let columns = {};
    if (x1 - x0 > 0 && y1 - y0 > 0) {
        columns = await this._view.to_columns({
            start_row: y0,
            start_col: x0,
            end_row: y1,
            end_col: x1,
            id: true
        });
        this._ids = columns.__ID__;
    }
    const data = [];
    const column_headers = [];
    for (const path of this._column_paths.slice(x0, x1)) {
        const path_parts = path.split("|");
        const column = columns[path] || new Array(y1 - y0).fill(null);
        data.push(column.map(x => _format.call(this, path_parts, x)));
        column_headers.push(path_parts);
    }
    return {
        num_rows: this._num_rows,
        num_columns: this._column_paths.length,
        row_headers: Array.from(_tree_header.call(this, columns.__ROW_PATH__, this._config.row_pivots)),
        column_headers,
        data
    };
}

export async function createModel(regular, table, view, extend = {}) {
    const config = await view.get_config();
    const [table_schema, table_computed_schema, num_rows, schema, computed_schema, column_paths] = await Promise.all([
        table.schema(),
        table.computed_schema(config.computed_columns),
        view.num_rows(),
        view.schema(),
        view.computed_schema(),
        view.column_paths()
    ]);
    const model = Object.assign(extend, {
        _view: view,
        _table: table,
        _table_schema: {...table_schema, ...table_computed_schema},
        _config: config,
        _num_rows: num_rows,
        _schema: {...schema, ...computed_schema},
        _ids: [],
        _column_paths: column_paths.filter(path => {
            return path !== "__ROW_PATH__" && path !== "__ID__";
        })
    });
    regular.setDataListener(dataListener.bind(model));
    return model;
}

export async function configureRegularTable(regular, model) {
    regular.addStyleListener(styleListener.bind(model, regular));
    regular.addEventListener("mousedown", mousedownListener.bind(model, regular));
    await regular.draw();
}
