// Coverage for RandomRestarts.hpp, the start-point generator behind the
// random-restart search in surface_metrics.cpp.
//
// That search used to call srand(time(NULL)) and then rand(), once per point
// pair. Three things were wrong with it and each has a case below: the draw
// depended on the wall clock, every pair inside the same second got the same
// 1000 cells, and the process-global rand() stream was reseeded out from under
// every other caller. The number it feeds, winding_valid_fraction, is declared
// as "trace_ranking_metric" in scripts/evaluation/example_config.json, so a
// score that moves between two identical runs is a score that cannot rank.

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "vc/core/util/RandomRestarts.hpp"

#include <cmath>
#include <cstdlib>
#include <set>
#include <utility>

using vc::sampling::restart_points;
using vc::sampling::restart_seed;

namespace
{
// core/test/data/segments/20241113070770 is 129 x 129, and the production
// caller asks for 1000 restarts.
constexpr int kW = 129;
constexpr int kH = 129;
constexpr int kTrials = 1000;

const cv::Vec3f kP1{1712.5f, 2210.25f, 7008.0f};
const cv::Vec3f kP2{1755.0f, 2183.75f, 7008.0f};
const cv::Vec3f kProx{1712.5f, 2210.25f, 7008.0f};
} // namespace

TEST_CASE("restart_seed: same query, same seed")
{
    CHECK(restart_seed(kP1, kP2, kProx, 0) == restart_seed(kP1, kP2, kProx, 0));
}

TEST_CASE("restart_seed: a different query is a different seed")
{
    // The whole point of deriving the seed from the geometry is that two
    // different segments do not end up probing the same 1000 cells. A fixed
    // constant would pass the determinism case above and fail here.
    const cv::Vec3f moved = kP2 + cv::Vec3f(1.0f, 0.0f, 0.0f);

    CHECK(restart_seed(kP1, kP2, kProx, 0) != restart_seed(moved, kP2, kProx, 0));
    CHECK(restart_seed(kP1, kP2, kProx, 0) != restart_seed(kP1, moved, kProx, 0));
    CHECK(restart_seed(kP1, kP2, kProx, 0) != restart_seed(kP1, kP2, moved, 0));

    // Order matters too: swapping the endpoints is a different query.
    CHECK(restart_seed(kP1, kP2, kProx, 0) != restart_seed(kP2, kP1, kProx, 0));
}

TEST_CASE("restart_seed: the user seed changes the draw")
{
    // This is what makes the noise floor of a metric measurable at all - the
    // same trace scored under seed 0 and seed 1 must be a genuinely different
    // sample, not the same one relabelled.
    std::set<std::uint32_t> seeds;
    for (std::uint32_t s = 0; s < 16; ++s) {
        seeds.insert(restart_seed(kP1, kP2, kProx, s));
    }
    CHECK(seeds.size() == 16);
}

TEST_CASE("restart_seed: a tiny change of geometry is not ignored")
{
    // Hashing the float bits rather than a rounded value: two points one ULP
    // apart are different queries and get different draws.
    cv::Vec3f nudged = kP1;
    nudged[0] = std::nextafter(nudged[0], 2000.0f);
    CHECK(restart_seed(kP1, kP2, kProx, 0) != restart_seed(nudged, kP2, kProx, 0));
}

TEST_CASE("restart_points: the same seed replays the same sequence")
{
    const auto a = restart_points(kW, kH, kTrials, 12345u);
    const auto b = restart_points(kW, kH, kTrials, 12345u);

    REQUIRE(a.size() == static_cast<std::size_t>(kTrials));
    REQUIRE(b.size() == a.size());
    for (std::size_t i = 0; i < a.size(); ++i) {
        CHECK(a[i][0] == b[i][0]);
        CHECK(a[i][1] == b[i][1]);
    }
}

TEST_CASE("restart_points: a different seed is a different sequence")
{
    const auto a = restart_points(kW, kH, kTrials, 12345u);
    const auto b = restart_points(kW, kH, kTrials, 12346u);

    REQUIRE(a.size() == b.size());
    std::size_t differing = 0;
    for (std::size_t i = 0; i < a.size(); ++i) {
        if (a[i][0] != b[i][0] || a[i][1] != b[i][1]) {
            ++differing;
        }
    }
    // Two independent draws over a 129 x 129 grid collide on about 1 in 16641
    // cells, so out of 1000 points essentially all of them should differ.
    CHECK(differing > 990);
}

TEST_CASE("restart_points: every point is inside the grid")
{
    // The caller indexes a surface with these, so an off-by-one at the top
    // end is an out-of-bounds read rather than a slightly wrong metric.
    const auto points = restart_points(kW, kH, kTrials, 7u);
    REQUIRE(points.size() == static_cast<std::size_t>(kTrials));
    for (const auto& p : points) {
        CHECK(p[0] >= 0.0f);
        CHECK(p[1] >= 0.0f);
        CHECK(p[0] <= static_cast<float>(kW - 1));
        CHECK(p[1] <= static_cast<float>(kH - 1));
        CHECK(p[0] == std::floor(p[0]));
        CHECK(p[1] == std::floor(p[1]));
    }
}

TEST_CASE("restart_points: the draw covers the grid")
{
    // Guards against a generator that is deterministic and in bounds but
    // degenerate - a stuck bit or a tiny period would still pass every case
    // above while probing the same handful of cells 1000 times. 1000 draws
    // from 16641 cells give about 971 distinct ones by the birthday bound.
    const auto points = restart_points(kW, kH, kTrials, 99u);
    std::set<std::pair<float, float>> distinct;
    for (const auto& p : points) {
        distinct.insert({p[0], p[1]});
    }
    CHECK(distinct.size() > 900);

    // And both axes are actually used, not just the first.
    std::set<float> xs, ys;
    for (const auto& p : points) {
        xs.insert(p[0]);
        ys.insert(p[1]);
    }
    CHECK(xs.size() > 100);
    CHECK(ys.size() > 100);
}

TEST_CASE("restart_points: a non-rectangular grid stays inside both bounds")
{
    // width and height are used separately; swapping them would be invisible
    // on the square fixture above.
    const auto points = restart_points(8, 512, 400, 3u);
    REQUIRE(points.size() == 400u);
    bool saw_high_y = false;
    for (const auto& p : points) {
        CHECK(p[0] <= 7.0f);
        CHECK(p[1] <= 511.0f);
        if (p[1] > 255.0f) {
            saw_high_y = true;
        }
    }
    CHECK(saw_high_y);
}

TEST_CASE("restart_points: a degenerate grid yields nothing")
{
    CHECK(restart_points(0, kH, kTrials, 1u).empty());
    CHECK(restart_points(kW, 0, kTrials, 1u).empty());
    CHECK(restart_points(-1, kH, kTrials, 1u).empty());
    CHECK(restart_points(kW, kH, 0, 1u).empty());
}

TEST_CASE("restart_points: the global rand() stream is left alone")
{
    // The old code called srand() inside the metrics function, which reseeded
    // the process-global generator that QuadSurface.cpp and PointCollections
    // also draw from. Sampling must not have that side effect.
    std::srand(4242u);
    const int expected_first = std::rand();
    const int expected_second = std::rand();

    std::srand(4242u);
    (void)restart_points(kW, kH, kTrials, 1u);
    (void)restart_seed(kP1, kP2, kProx, 1u);

    CHECK(std::rand() == expected_first);
    CHECK(std::rand() == expected_second);
}
