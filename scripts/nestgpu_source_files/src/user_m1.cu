/*
 *  user_m1_iaf_psc_exp.cu
 *
 *  This file is part of NEST GPU.
 *
 *  Copyright (C) 2021 The NEST Initiative
 *
 *  NEST GPU is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  NEST GPU is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with NEST GPU.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// adapted from:
// https://github.com/nest/nest-simulator/blob/master/models/user_m1.cpp

#include "propagator_stability.h"
#include "spike_buffer.h"
#include "user_m1.h"
#include <cmath>
#include <config.h>
#include <iostream>

using namespace user_m1_ns;

extern __constant__ float NESTGPUTimeResolution;
extern __device__ double propagator_32( double, double, double, double );

#define g_m var[ i_g_m ]
#define v_m var[ i_v_m ]
#define ref_on var[ i_ref_on ]
#define slnc_on var[ i_slnc_on ]
#define refractory_step var[ i_refractory_step ]

#define v_0 param[ i_v_0 ]
#define v_rst param[ i_v_rst ]
#define v_th param[ i_v_th ]
#define tau_mbr param[ i_tau_mbr ]
#define tau_g param[ i_tau_g ]
#define t_ref param[ i_t_ref ]
#define den_delay param[ i_den_delay ]

#define P1 param[ i_P1 ]
#define P2 param[ i_P2 ]

__global__ void
user_m1_Calibrate( int n_node, float* param_arr, int n_param, float h )
{
  int i_neuron = threadIdx.x + blockIdx.x * blockDim.x;
  if ( i_neuron < n_node )
  {
    float* param = param_arr + n_param * i_neuron;

    P1 = h / tau_mbr;
    P2 = h / tau_g;
  }
}

__global__ void
user_m1_Update( int n_node, int i_node_0, float* var_arr, float* param_arr, int n_var, int n_param )
{
  int i_neuron = threadIdx.x + blockIdx.x * blockDim.x;
  if ( i_neuron < n_node )
  {
    float* var = var_arr + n_var * i_neuron;
    float* param = param_arr + n_param * i_neuron;

    if ( refractory_step > 0.0 )
    {
      // neuron is absolute refractory
      refractory_step -= 1.0;
      g_m = 0;
    }
    else
    { // neuron is not refractory, so evolve V
      v_m += (v_0 - v_m + g_m) * P1;
      g_m += -g_m * P2;

      if ( v_m >= v_th) 
      { // threshold crossing
        if (!slnc_on) PushSpike( i_node_0 + i_neuron, 1.0 ); // generate spike if neuron is not silenced
        v_m = v_rst;
        g_m = 0;
        if (ref_on) refractory_step = ( int ) round( t_ref / NESTGPUTimeResolution );
      }
    }        
  }
}

user_m1::~user_m1()
{
  FreeVarArr();
  FreeParamArr();
}

int
user_m1::Init( int i_node_0, int n_node, int /*n_port*/, int i_group )
{
  BaseNeuron::Init( i_node_0, n_node, 2 /*n_port*/, i_group );
  node_type_ = i_user_m1_model;

  n_scal_var_ = N_SCAL_VAR;
  n_var_ = n_scal_var_;
  n_scal_param_ = N_SCAL_PARAM;
  n_param_ = n_scal_param_;

  AllocParamArr();
  AllocVarArr();

  scal_var_name_ = user_m1_scal_var_name;
  scal_param_name_ = user_m1_scal_param_name;

  SetScalParam( 0, n_node, "v_0", -52.0);     // mV
  SetScalParam( 0, n_node, "v_rst", -52.0);   // mV
  SetScalParam( 0, n_node, "v_th", -45.0);    // mV
  SetScalParam( 0, n_node, "tau_mbr", 20.0);  // ms
  SetScalParam( 0, n_node, "tau_g", 5.0);     // ms
  SetScalParam( 0, n_node, "t_ref", 2.2 );     // in ms
  SetScalParam( 0, n_node, "den_delay", 0.0 ); // in ms
  SetScalParam( 0, n_node, "P1", 0.0 );
  SetScalParam( 0, n_node, "P2", 0.0 );

  SetScalVar( 0, n_node, "g_m", 0.0 );     // mV
  SetScalVar( 0, n_node, "v_m", -52.0 );   // mV
  SetScalVar( 0, n_node, "ref_on", 1);     // bool
  SetScalVar( 0, n_node, "slnc_on", 0);    // bool
  SetScalVar( 0, n_node, "refractory_step", 0 );

  // multiplication factor of input signal is always 1 for all nodes
  float input_weight = 1.0;
  CUDAMALLOCCTRL( "&port_weight_arr_", &port_weight_arr_, sizeof( float ) );
  gpuErrchk( cudaMemcpy( port_weight_arr_, &input_weight, sizeof( float ), cudaMemcpyHostToDevice ) );
  port_weight_arr_step_ = 0;
  port_weight_port_step_ = 0;

  // input spike signal is stored in I_syn_ex, I_syn_in
  //port_input_arr_ = GetVarArr() + GetScalVarIdx( "I_syn_ex" );
  port_input_arr_ = GetVarArr() + GetScalVarIdx( "g_m" );  // USER: changed from "I_syn_ex", revert if this gives issues
  port_input_arr_step_ = n_var_;
  port_input_port_step_ = 1;

  den_delay_arr_ = GetParamArr() + GetScalParamIdx( "den_delay" );

  return 0;
}

int
user_m1::Update( long long it, double t1 )
{
  // std::cout << "user_m1 neuron update\n";
  user_m1_Update<<< ( n_node_ + 1023 ) / 1024, 1024 >>>( n_node_, i_node_0_, var_arr_, param_arr_, n_var_, n_param_ );
  // gpuErrchk( cudaDeviceSynchronize() );

  return 0;
}

int
user_m1::Free()
{
  FreeVarArr();
  FreeParamArr();

  return 0;
}

int
user_m1::Calibrate( double, float time_resolution )
{
  user_m1_Calibrate<<< ( n_node_ + 1023 ) / 1024, 1024 >>>( n_node_, param_arr_, n_param_, time_resolution );

  return 0;
}
