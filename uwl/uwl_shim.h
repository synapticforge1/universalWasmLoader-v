/*
 * uwl_shim.h — V-facing C surface over the Universal WASM Loader.
 *
 * Self-contained: it does NOT include universal_wasm_loader.h (nor wasm.h), so
 * V can parse it into its own translation unit without the wasmtime headers.
 * Every entry point V needs is a `uwlv_*` wrapper declared here; the real
 * implementation (uwl_shim.c) includes the loader for the definitions.
 *
 * Why a shim at all: the loader's value constructors/accessors are `static
 * inline` (not linkable) and `uwl_val_t` is awkward to pass by value across V's
 * FFI. The shim hides both behind a primitive `uwlv_arg` array + out-params.
 */
#ifndef UWL_SHIM_H
#define UWL_SHIM_H

#include <stddef.h>

/* Opaque module handle; the full definition lives in the loader. */
typedef struct uwl_module uwl_module_t;

/* One value (call argument, call result, or host-callback argument / result).
 * Only the field matching `kind` is read. */
typedef struct {
    int          kind; /* uwl_kind_t: 0=void 1=i32 2=i64 3=f32 4=f64 5=bool 6=str 7=err */
    long long    i;    /* i32 / i64 / bool */
    double       d;    /* f32 / f64 */
    const char  *s;    /* string (NUL-terminated; borrowed) */
} uwlv_arg;

/*
 * Load a module. `names[k]` is the camelCase WIT import name of host callback
 * k, and `ctxs[k]` the context the loader hands back for it; every call of
 * that import reaches uwlv_host_dispatch(ctxs[k], ...). `n` may be 0 (both
 * arrays NULL). Returns NULL with *err set (heap; free with uwlv_free_str) on
 * failure — including a WIT import with no callback (SPEC 4.0.0 § 4).
 */
uwl_module_t *uwlv_import_with(const char *path, const char *const *names,
                               void *const *ctxs, size_t n, char **err);
void          uwlv_free(uwl_module_t *m);
void          uwlv_free_str(char *s);

/*
 * Call an export. Returns 0 on success, -1 on failure (with *err set to a heap
 * string — free with uwlv_free_str). On success *out_kind holds the result
 * kind; the matching out-param carries the value. For a string result *out_s is
 * a heap string the caller frees with uwlv_free_str.
 */
int uwlv_call(uwl_module_t *m, const char *name,
              const uwlv_arg *args, size_t n,
              int *out_kind, long long *out_i, double *out_d, char **out_s,
              char **err);

/*
 * DEFINED IN V (uwl.v, `@[export]`), called by the shim's import trampoline:
 * runs the V callback behind `ctx` with the decoded `args` (strings borrowed
 * for the call) and sets *out to its value — or, when the callback failed, to
 * kind 7 (UWL_ERR) with `s` the message, borrowed until the shim copies it into
 * uwl_err(). (No `const` on `args`: the prototype must match the one V
 * generates for the exported function.)
 */
void uwlv_host_dispatch(void *ctx, uwlv_arg *args, size_t n, uwlv_arg *out);

#endif /* UWL_SHIM_H */
