#include <ecc/curves/bn254/g1.hpp>
#include <common/test.hpp>
#include <fstream>
#include <common/serialize.hpp>

namespace test_affine_element {

using namespace barretenberg;

TEST(affine_element, read_write_buffer)
{
    g1::affine_element P = g1::affine_element(g1::element::random_element());
    g1::affine_element Q;
    g1::affine_element R;

    std::vector<uint8_t> v(64);
    uint8_t* ptr = v.data();
    g1::affine_element::serialize_to_buffer(P, ptr);

    Q = g1::affine_element::serialize_from_buffer(ptr + 1);
    ASSERT_FALSE(Q.on_curve() && !Q.is_point_at_infinity());
    R = g1::affine_element::serialize_from_buffer(ptr);
    ASSERT_TRUE(R.on_curve());

    ASSERT_FALSE(P == Q);
    ASSERT_TRUE(P == R);
}

// Regression test to ensure that the point at infinity is not equal to its coordinate-wise reduction, which may lie
// on the curve, depending on the y-coordinate.
TEST(affine_element, infinity_regression)
{
    g1::affine_element P;
    P.self_set_infinity();
    g1::affine_element R(0, P.y);
    ASSERT_FALSE(P == R);
}
} // namespace test_affine_element