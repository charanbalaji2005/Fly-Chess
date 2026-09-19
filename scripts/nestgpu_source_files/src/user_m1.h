/*
 *  user_m1_iaf_psc_exp.h
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
// https://github.com/nest/nest-simulator/blob/master/models/user_m1.h

#ifndef USERM1IAFPSCEXP_H
#define USERM1IAFPSCEXP_H

#include "base_neuron.h"
#include "cuda_error.h"
#include "neuron_models.h"
#include "node_group.h"
#include <iostream>
#include <string>

namespace user_m1_ns
{
enum ScalVarIndexes
{
  i_g_m = 0,           // postsynaptic input
  i_v_m,               // membrane potential
  i_ref_on,            // refractory period toggle
  i_slnc_on,           // neuron silencing toggle
  i_refractory_step,   // refractory step counter
  N_SCAL_VAR
};

enum ScalParamIndexes
{
  i_v_0 = 0,      // resting potential in mV
  i_v_rst,        // reset potential after spike in mV
  i_v_th,         // threshold potential in mV
  i_tau_mbr,      // time constant for membrane potential decay in ms
  i_tau_g,        // time constant for postsynaptic input in ms

  i_t_ref,     // Refractory period in ms
  i_den_delay, // dendritic backpropagation delay
  // time evolution operator
  i_P1,
  i_P2,
  N_SCAL_PARAM
};

const std::string user_m1_scal_var_name[ N_SCAL_VAR ] = { "g_m", "v_m", "ref_on", "slnc_on", "refractory_step" };

const std::string user_m1_scal_param_name[ N_SCAL_PARAM ] = { "v_0",
  "v_rst",
  "v_th",
  "tau_mbr",
  "tau_g",
  "t_ref",
  "den_delay",
  "P1",
  "P2" };

} // namespace user_m1_ns

class user_m1 : public BaseNeuron
{
public:
  ~user_m1();

  int Init( int i_node_0, int n_neuron, int n_port, int i_group );

  int Calibrate( double, float time_resolution );

  int Update( long long it, double t1 );

  int Free();
};

#endif
