// Reproduces, in isolation, the sampling pattern of
// volume-cartographer/core/src/surface_metrics.cpp:85-91 as of HEAD.
//
//     srand(time(NULL));
//     for (int i = 0; i < 1000; ++i) {
//         cv::Vec2f nominal_loc = { (float)(rand() % s_size.width),
//                                   (float)(rand() % s_size.height) };
//
// find_closest_intersection() is called once per adjacent point pair
// (surface_metrics.cpp:229), so this runs N-1 times per surface, and its
// result feeds results["winding_valid_fraction"] (surface_metrics.cpp:267),
// which scripts/evaluation/example_config.json declares as
// "trace_ranking_metric".
//
// No OpenCV, no CMake, no dependencies: g++ -O2 srand_pattern.cpp
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <vector>
#include <cstring>

static const int W = 129, H = 129;   // core/test/data/segments/20241113070770

// One call of the sampling loop, exactly as the function does it.
static std::vector<int> sample_once(unsigned seed_time)
{
    srand(seed_time);                       // what the code does, with time(NULL)
    std::vector<int> pts;
    pts.reserve(2000);
    for (int i = 0; i < 1000; ++i) {
        pts.push_back(rand() % W);
        pts.push_back(rand() % H);
    }
    return pts;
}

int main()
{
    // 1. Two calls inside the SAME wall-clock second.
    std::vector<int> a = sample_once(1758000000u);
    std::vector<int> b = sample_once(1758000000u);
    bool same_second_identical = (a == b);

    // 2. Two calls one second apart.
    std::vector<int> c = sample_once(1758000001u);
    int differing = 0;
    for (size_t i = 0; i < a.size(); ++i) if (a[i] != c[i]) differing++;

    // 3. The global rand() state is clobbered for everyone else.
    //    QuadSurface.cpp:1589,1709,1714,3239 and PointCollections.cpp:864-866
    //    draw from the same global generator.
    srand(12345);
    int before = rand();
    srand(12345);
    (void)sample_once(1758000000u);          // the metrics function runs
    int after = rand();
    bool caller_state_clobbered = (before != after);

    printf("W=%d H=%d, 1000 trials, 2000 draws per call\n\n", W, H);
    printf("1. two calls in the SAME second produce an identical pattern : %s\n",
           same_second_identical ? "YES  <-- statistically wrong" : "no");
    printf("2. one second later, draws that differ                      : %d / %zu (%.1f%%)\n",
           differing, a.size(), 100.0 * differing / a.size());
    printf("3. an unrelated caller's rand() stream is clobbered         : %s\n",
           caller_state_clobbered ? "YES  <-- global state" : "no");
    printf("\nfirst 6 draws, same second : %d %d %d %d %d %d\n", a[0],a[1],a[2],a[3],a[4],a[5]);
    printf("first 6 draws, second later: %d %d %d %d %d %d\n", c[0],c[1],c[2],c[3],c[4],c[5]);

    return (same_second_identical && differing > 0 && caller_state_clobbered) ? 0 : 1;
}
