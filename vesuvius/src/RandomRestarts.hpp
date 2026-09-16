#pragma once

// Deterministic start points for the random-restart searches in the metrics
// code. Split out of surface_metrics.cpp so the part that has to be
// reproducible is a pure function with no hidden state, and can be tested
// without building a QuadSurface.
//
// Two properties are load-bearing here:
//
//   * The sequence depends only on the arguments. No wall clock, no global
//     generator. Re-running an evaluation on the same inputs gives the same
//     number, which is what makes a reported metric comparable between runs.
//   * The sequence still differs between call sites, because restart_seed()
//     mixes the geometry of the query into it. A fixed constant would make
//     every segment of every surface probe the same 1000 cells, which is a
//     different bug wearing the word "deterministic".

#include <cstdint>
#include <cstring>
#include <random>
#include <vector>

#include <opencv2/core/matx.hpp>

namespace vc::sampling
{

namespace detail
{
// FNV-1a. Chosen because it is short enough to read, has no tables, and is
// fully specified - the same bytes give the same digest on every platform and
// every standard library, which std::hash does not promise.
inline constexpr std::uint32_t kFnvOffsetBasis = 0x811c9dc5u;
inline constexpr std::uint32_t kFnvPrime = 0x01000193u;

inline std::uint32_t fnv1a(std::uint32_t h, std::uint32_t word)
{
    for (int byte = 0; byte < 4; ++byte) {
        h ^= static_cast<std::uint32_t>((word >> (byte * 8)) & 0xffu);
        h *= kFnvPrime;
    }
    return h;
}

inline std::uint32_t float_bits(float f)
{
    std::uint32_t bits = 0;
    std::memcpy(&bits, &f, sizeof(bits));
    return bits;
}

inline std::uint32_t hash_vec3(std::uint32_t h, const cv::Vec3f& v)
{
    h = fnv1a(h, float_bits(v[0]));
    h = fnv1a(h, float_bits(v[1]));
    h = fnv1a(h, float_bits(v[2]));
    return h;
}

// Draw uniformly from [0, n) with the bias removed. mt19937 covers
// [0, 2^32), which is not a multiple of n, so plain `% n` would make the
// first 2^32 % n values marginally more likely. For n = 129 that bias is
// about 3e-8 and rejection almost never fires, but the whole point of this
// header is that the numbers are defensible, so it is not worth leaving in.
inline std::uint32_t bounded(std::mt19937& rng, std::uint32_t n)
{
    if (n == 0) {
        return 0;
    }
    const std::uint64_t span = std::uint64_t{1} << 32;
    const std::uint64_t limit = span - (span % n);
    std::uint64_t value;
    do {
        value = rng();
    } while (value >= limit);
    return static_cast<std::uint32_t>(value % n);
}
} // namespace detail

/**
 * Seed for a restart sequence, derived from the query itself.
 *
 * @param a,b,c  the geometry the search is about - for
 *               find_closest_intersection() these are the two segment
 *               endpoints and the proximity point.
 * @param user_seed  caller-supplied offset, so a whole evaluation can be
 *               repeated under a different draw without changing anything
 *               else. 0 is the default run.
 */
inline std::uint32_t restart_seed(const cv::Vec3f& a, const cv::Vec3f& b, const cv::Vec3f& c,
                                  std::uint32_t user_seed)
{
    std::uint32_t h = detail::kFnvOffsetBasis;
    h = detail::hash_vec3(h, a);
    h = detail::hash_vec3(h, b);
    h = detail::hash_vec3(h, c);
    h = detail::fnv1a(h, user_seed);
    return h;
}

/**
 * @c count start cells drawn uniformly from the [0, width) x [0, height)
 * grid. Returns an empty vector if the grid is degenerate, so a caller that
 * loops over the result simply does nothing rather than sampling garbage.
 */
inline std::vector<cv::Vec2f> restart_points(int width, int height, int count, std::uint32_t seed)
{
    std::vector<cv::Vec2f> points;
    if (width <= 0 || height <= 0 || count <= 0) {
        return points;
    }

    std::mt19937 rng(seed);
    points.reserve(static_cast<std::size_t>(count));
    for (int i = 0; i < count; ++i) {
        const float x = static_cast<float>(detail::bounded(rng, static_cast<std::uint32_t>(width)));
        const float y = static_cast<float>(detail::bounded(rng, static_cast<std::uint32_t>(height)));
        points.push_back({x, y});
    }
    return points;
}

} // namespace vc::sampling
