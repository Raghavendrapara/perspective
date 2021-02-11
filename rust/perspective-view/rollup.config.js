import babel from "@rollup/plugin-babel";
import filesize from "rollup-plugin-filesize";
import postcss from "rollup-plugin-postcss";
import sourcemaps from "rollup-plugin-sourcemaps";

export default () => {
    return [
        {
            input: "src/js/bootstrap.js",
            external: [/node_modules/, /pkg/],
            output: {
                sourcemap: true,
                dir: "dist/esm/"
            },
            plugins: [
                babel({
                    exclude: "node_modules/**",
                    babelHelpers: "bundled"
                }),
                filesize(),
                postcss({
                    inject: false,
                    sourceMap: true,
                    minimize: {mergeLonghand: false}
                }),
                sourcemaps()
            ].filter(x => x),
            watch: {
                clearScreen: false
            }
        }
    ];
};
